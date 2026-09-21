import { setTimeout as delay } from "node:timers/promises";
import { DEMO_HANDOFF_DELAY_MS } from "../demo/pacing";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { PgBoss } from "pg-boss";
import { labRuns, submissionAttempts } from "../db/schema";
import { applyFulfillmentEventInTransaction } from "../db/apply-event";
import type { ConnectorResult, Submission } from "../simulator/protocol";
import {
  attempts,
  audit,
  eventTime,
  loadRun,
  noAction,
  withRunLock,
  type Resources,
  type RunRow,
} from "../recovery/state";
import type { Transaction } from "../db/client";
import { scheduleAction, requireReview } from "../recovery/schedule";
import {
  canRetrySubmission,
  LOOKUP_DELAY_MS,
  MAX_SUBMISSIONS,
  retryDelayMs,
} from "../recovery/policy";

export async function recordInterrupted(
  tx: Transaction,
  boss: PgBoss,
  row: RunRow,
) {
  const [last] = await attempts(tx, row.run.id);
  const now = eventTime(row);
  await applyFulfillmentEventInTransaction(tx, {
    storeId: row.run.storeId,
    intentId: row.intent.id,
    expectedVersion: row.intent.version,
    actor: "demo_worker",
    occurredAt: now,
    event: { type: "submission_timed_out" },
  });
  await tx
    .update(labRuns)
    .set({ ...noAction, status: "unknown", completedAt: now })
    .where(eq(labRuns.id, row.run.id));
  if (last)
    await tx
      .update(submissionAttempts)
      .set({ result: "interrupted", completedAt: now })
      .where(eq(submissionAttempts.id, last.id));
  await audit(
    tx,
    row,
    "interrupted_submission",
    "Interrupted submission held for review",
    "The earlier attempt has no recorded outcome. No new POST was issued; recovery will use a read-only reference lookup.",
    "warning",
  );
  await scheduleAction(
    tx,
    boss,
    row,
    "lookup",
    LOOKUP_DELAY_MS,
    "Interrupted submission: investigate the original reference, never blindly resubmit.",
  );
}

/** Exactly one claim per authorized delivery. Repeated/stale deliveries cannot
 * create a new attempt. Unknown outcomes go to GET lookup, not another POST. */
export async function processRun(
  resources: Resources,
  rawId: string,
  submit: (request: Submission) => Promise<ConnectorResult>,
  boss: PgBoss,
  hooks?: { afterClaim?: () => Promise<void> },
  retryActionId?: string,
) {
  const id = z.uuid().parse(rawId);
  const deliveryId = retryActionId ? z.uuid().parse(retryActionId) : id;
  return withRunLock(resources, id, async () => {
    const request = await resources.db.transaction(async (tx) => {
      const row = await loadRun(tx, id);
      const history = await attempts(tx, id);
      if (row.run.status === "running") {
        if (history[0]?.jobId === deliveryId)
          await recordInterrupted(tx, boss, row);
        return null;
      }
      if (retryActionId) {
        if (
          row.run.pendingAction !== "retry" ||
          row.run.pendingActionId !== deliveryId ||
          row.run.reviewReason ||
          row.run.nextActionAt!.getTime() > Date.now()
        )
          return null;
        if (
          row.intent.state !== "retry_scheduled" ||
          history[0]?.result !== "unavailable"
        ) {
          await requireReview(
            tx,
            row,
            "Retry evidence is missing or changed. No submission was issued.",
          );
          return null;
        }
      } else if (row.run.status !== "queued" || history.length) return null;
      if (!retryActionId && row.run.submissionNotBefore && row.run.submissionNotBefore.getTime() > Date.now())
        throw new Error("Initial submission is not due yet");
      if (history.length >= MAX_SUBMISSIONS) {
        await requireReview(tx, row, "Submission retry budget exhausted.");
        return null;
      }
      const now = eventTime(row);
      await applyFulfillmentEventInTransaction(tx, {
        storeId: row.run.storeId,
        intentId: row.intent.id,
        expectedVersion: row.intent.version,
        actor: "demo_worker",
        occurredAt: now,
        event: { type: "submission_started" },
      });
      await tx
        .update(labRuns)
        .set({ ...noAction, status: "running", completedAt: null })
        .where(eq(labRuns.id, id));
      const [claim] = await tx
        .insert(submissionAttempts)
        .values({
          runId: id,
          attemptNumber: history.length + 1,
          jobId: deliveryId,
          startedAt: now,
        })
        .returning();
      return {
        claimId: claim.id,
        pacedFirstHandoff: row.run.demoPacing && history.length === 0,
        request: {
          reference: row.intent.externalReference,
          amountMinor: row.order.totalMinor,
          currency: "USD" as const,
          scenario: row.run.scenario,
        },
      };
    });
    if (!request) return;
    await hooks?.afterClaim?.();
    // The claim and per-run lock already exist. A crash here is still an
    // interrupted/unknown attempt: recovery must look up, never replay this POST.
    if (request.pacedFirstHandoff) await delay(DEMO_HANDOFF_DELAY_MS);
    let result: ConnectorResult;
    try {
      result = await submit(request.request);
    } catch {
      result = { kind: "unknown" };
    }
    await resources.db.transaction(async (tx) => {
      const row = await loadRun(tx, id);
      const history = await attempts(tx, id);
      if (row.run.status !== "running" || history[0]?.id !== request.claimId)
        return;
      const now = eventTime(row);
      const apply = (
        event: Parameters<
          typeof applyFulfillmentEventInTransaction
        >[1]["event"],
      ) =>
        applyFulfillmentEventInTransaction(tx, {
          storeId: row.run.storeId,
          intentId: row.intent.id,
          expectedVersion: row.intent.version,
          actor: "demo_worker",
          occurredAt: now,
          event,
        });
      await tx
        .update(submissionAttempts)
        .set({ result: result.kind, completedAt: now })
        .where(eq(submissionAttempts.id, request.claimId));
      const status =
        result.kind === "accepted"
          ? "accepted"
          : result.kind === "rejected"
            ? "rejected"
            : result.kind === "unavailable"
              ? "unavailable"
              : "unknown";
      await tx
        .update(labRuns)
        .set({ status, completedAt: now })
        .where(eq(labRuns.id, id));
      if (result.kind === "accepted") {
        await apply({
          type: "acceptance_confirmed",
          warehouseReference: result.warehouseReference,
          evidence: {
            reference: row.intent.externalReference,
            detail:
              "Authenticated simulator acknowledgement matched the original reference and payload.",
          },
        });
      } else if (result.kind === "rejected") {
        await apply({ type: "address_rejected" });
        await tx
          .update(labRuns)
          .set({
            reviewReason:
              "Shipping address rejected. Corrected-address submission is not enabled.",
          })
          .where(eq(labRuns.id, id));
      } else if (canRetrySubmission(result.kind, history.length)) {
        await apply({
          type: "retry_authorized",
          evidence: {
            reference: row.intent.externalReference,
            basis: "provider_idempotency",
            detail:
              "Documented simulator 503 response declares reference-v1 idempotency. Reuse the exact reference and unchanged payload; bounded budget applies.",
          },
        });
        await scheduleAction(
          tx,
          boss,
          row,
          "retry",
          retryDelayMs(history.length),
          `Confirmed temporary failure. ${history.length}/${MAX_SUBMISSIONS} submissions used.`,
        );
      } else if (result.kind === "unavailable") {
        await apply({
          type: "review_required",
          kind: "warehouse_unavailable",
          reason:
            "Three confirmed temporary failures exhausted the submission budget. No further POST is scheduled.",
        });
        await tx
          .update(labRuns)
          .set({
            reviewReason:
              "Submission budget exhausted (3/3). Investigate the warehouse before any future authorized action.",
          })
          .where(eq(labRuns.id, id));
        await audit(
          tx,
          row,
          "retry_exhausted",
          "Retry budget exhausted",
          "Three submissions recorded. Automation stopped; further submission requires a future authorized workflow.",
          "warning",
        );
      } else {
        await apply({ type: "submission_timed_out" });
        await scheduleAction(
          tx,
          boss,
          row,
          "lookup",
          LOOKUP_DELAY_MS,
          "Submission outcome uncertain. Only a reference lookup is authorized.",
        );
      }
    });
  });
}
