import { eq, max } from "drizzle-orm";
import { z } from "zod";
import type { createDatabase, Transaction } from "../db/client";
import {
  auditEvents,
  fulfillmentIntents,
  labRuns,
  orders,
  submissionAttempts,
} from "../db/schema";
import { applyFulfillmentEventInTransaction } from "../db/apply-event";
import type { ConnectorResult, Submission } from "../simulator/protocol";
import type { FulfillmentEvent } from "../domain/fulfillment";
import type { RunState } from "../lab/contracts";

type Resources = ReturnType<typeof createDatabase>;
async function loadRun(tx: Transaction, id: string) {
  const [row] = await tx
    .select({ run: labRuns, intent: fulfillmentIntents, order: orders })
    .from(labRuns)
    .innerJoin(fulfillmentIntents, eq(fulfillmentIntents.id, labRuns.intentId))
    .innerJoin(orders, eq(orders.id, fulfillmentIntents.orderId))
    .where(eq(labRuns.id, id))
    .for("update", { of: [labRuns, fulfillmentIntents] });
  if (!row) throw new Error("Demo run not found");
  return row;
}

/** Queue delivery may repeat. The persisted claim is the no-resubmission boundary.
 * A process lost after claiming is classified as unknown on redelivery, even if
 * it might have crashed BEFORE sending. That conservative false uncertainty is
 * preferable to duplicate fulfillment. Reconciliation is a later increment.
 */
export async function processRun(
  resources: Resources,
  rawId: string,
  submit: (request: Submission) => Promise<ConnectorResult>,
  hooks?: { afterClaim?: () => Promise<void> },
) {
  const id = z.uuid().parse(rawId);
  const client = await resources.pool.connect();
  let locked = false;
  let broken = false;
  try {
    const lock = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock(hashtextextended($1, 7303)) AS locked",
      [id],
    );
    locked = lock.rows[0].locked;
    if (!locked) throw new Error("Demo run is already being handled");
    const request = await resources.db.transaction(async (tx) => {
      const { run, intent, order } = await loadRun(tx, id);
      if (run.status !== "queued" && run.status !== "running") return null;
      const now = new Date(Math.max(Date.now(), intent.updatedAt.getTime()));
      if (run.status === "running") {
        await applyFulfillmentEventInTransaction(tx, {
          storeId: run.storeId,
          intentId: intent.id,
          expectedVersion: intent.version,
          actor: "demo_worker",
          occurredAt: now,
          event: { type: "submission_timed_out" },
        });
        await tx
          .update(labRuns)
          .set({ status: "unknown", completedAt: now })
          .where(eq(labRuns.id, id));
        await tx
          .update(submissionAttempts)
          .set({ result: "interrupted", completedAt: now })
          .where(eq(submissionAttempts.runId, id));
        const [last] = await tx
          .select({ seq: max(auditEvents.sequence) })
          .from(auditEvents)
          .where(eq(auditEvents.intentId, intent.id));
        await tx.insert(auditEvents).values({
          intentId: intent.id,
          sequence: (last.seq ?? 0) + 1,
          type: "interrupted_submission",
          actor: "demo_worker",
          title: "Interrupted submission held for review",
          description:
            "An earlier worker claimed this submission without recording an outcome. This delivery made no new warehouse request.",
          tone: "warning",
          occurredAt: now,
        });
        return null;
      }
      await applyFulfillmentEventInTransaction(tx, {
        storeId: run.storeId,
        intentId: intent.id,
        expectedVersion: intent.version,
        actor: "demo_worker",
        occurredAt: now,
        event: { type: "submission_started" },
      });
      await tx
        .update(labRuns)
        .set({ status: "running" })
        .where(eq(labRuns.id, id));
      await tx.insert(submissionAttempts).values({ runId: id, startedAt: now });
      return {
        reference: intent.externalReference,
        amountMinor: order.totalMinor,
        currency: "USD" as const,
        scenario: run.scenario,
      };
    });
    if (!request) return;
    await hooks?.afterClaim?.();
    let result: ConnectorResult;
    try {
      result = await submit(request);
    } catch {
      result = { kind: "unknown" };
    }
    await resources.db.transaction(async (tx) => {
      const { run, intent } = await loadRun(tx, id);
      if (run.status !== "running") return;
      const now = new Date(Math.max(Date.now(), intent.updatedAt.getTime()));
      let event: FulfillmentEvent;
      let status: RunState;
      switch (result.kind) {
        case "accepted":
          status = "accepted";
          event = {
            type: "acceptance_confirmed",
            warehouseReference: result.warehouseReference,
            evidence: {
              reference: intent.externalReference,
              detail:
                "The authenticated simulator returned a matching acceptance acknowledgement.",
            },
          };
          break;
        case "rejected":
          status = "rejected";
          event = { type: "address_rejected" };
          break;
        case "unavailable":
          status = "unavailable";
          event = {
            type: "review_required",
            kind: "warehouse_unavailable",
            reason:
              "The simulator returned its documented 503 response. No automatic business retry is enabled in increment 003.",
          };
          break;
        default:
          status = "unknown";
          event = { type: "submission_timed_out" };
      }
      await applyFulfillmentEventInTransaction(tx, {
        storeId: run.storeId,
        intentId: intent.id,
        expectedVersion: intent.version,
        actor: "demo_worker",
        occurredAt: now,
        event,
      });
      await tx
        .update(submissionAttempts)
        .set({ result: result.kind, completedAt: now })
        .where(eq(submissionAttempts.runId, id));
      await tx
        .update(labRuns)
        .set({ status, completedAt: now })
        .where(eq(labRuns.id, id));
    });
  } finally {
    if (locked) {
      try {
        await client.query(
          "SELECT pg_advisory_unlock(hashtextextended($1, 7303))",
          [id],
        );
      } catch {
        broken = true;
      }
    }
    client.release(broken);
  }
}
