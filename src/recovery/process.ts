import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { PgBoss } from "pg-boss";
import { labRuns } from "../db/schema";
import { applyFulfillmentEventInTransaction } from "../db/apply-event";
import type {
  ConnectorResult,
  LookupResult,
  Submission,
} from "../simulator/protocol";
import { processRun, recordInterrupted } from "../worker/process-run";
import {
  attempts,
  audit,
  eventTime,
  loadRun,
  noAction,
  RunBusyError,
  withRunLock,
  type Resources,
} from "./state";
import { requireReview, scheduleAction } from "./schedule";
import { MAX_LOOKUPS, retryDelayMs, STALE_ACTION_MS } from "./policy";

export const recoveryJobSchema = z
  .object({ runId: z.uuid(), actionId: z.uuid() })
  .strict();
export interface Connectors {
  submit: (request: Submission) => Promise<ConnectorResult>;
  lookup: (reference: string) => Promise<LookupResult>;
}

export async function processRecovery(
  resources: Resources,
  boss: PgBoss,
  input: z.infer<typeof recoveryJobSchema>,
  connectors: Connectors,
) {
  const { runId, actionId } = recoveryJobSchema.parse(input);
  const [initial] = await resources.db
    .select()
    .from(labRuns)
    .where(eq(labRuns.id, runId));
  if (!initial) return;
  if (
    initial.pendingAction !== "lookup" ||
    initial.pendingActionId !== actionId
  ) {
    // Handles a retry claim interrupted after clearing its pending-action fields.
    return processRun(
      resources,
      runId,
      connectors.submit,
      boss,
      undefined,
      actionId,
    );
  }
  return withRunLock(resources, runId, async () => {
    const request = await resources.db.transaction(async (tx) => {
      const row = await loadRun(tx, runId);
      if (
        row.run.pendingActionId !== actionId ||
        row.run.pendingAction !== "lookup" ||
        row.run.reviewReason ||
        row.run.nextActionAt!.getTime() > Date.now()
      )
        return null;
      if (row.run.lookupCount >= MAX_LOOKUPS) {
        await requireReview(
          tx,
          row,
          "Warehouse lookup budget exhausted. Outcome remains unverified; do not resubmit.",
        );
        return null;
      }
      const count = row.run.lookupCount + 1;
      await tx
        .update(labRuns)
        .set({ lookupCount: count })
        .where(eq(labRuns.id, runId));
      await audit(
        tx,
        row,
        "lookup_started",
        "Checking the original warehouse reference",
        `Read-only GET ${count}/${MAX_LOOKUPS}. No fulfillment submission is authorized by this action.`,
      );
      return row.intent.externalReference;
    });
    if (!request) return;
    let result: LookupResult;
    try {
      result = await connectors.lookup(request);
    } catch {
      result = { kind: "unavailable" };
    }
    await resources.db.transaction(async (tx) => {
      const row = await loadRun(tx, runId);
      if (row.run.pendingActionId !== actionId) return;
      if (result.kind === "found") {
        await applyFulfillmentEventInTransaction(tx, {
          storeId: row.run.storeId,
          intentId: row.intent.id,
          expectedVersion: row.intent.version,
          actor: "reconciliation_worker",
          occurredAt: eventTime(row),
          event: {
            type: "acceptance_confirmed",
            warehouseReference: result.warehouseReference,
            evidence: {
              reference: row.intent.externalReference,
              detail:
                "Read-only authenticated warehouse lookup found the original fulfillment. No new POST was made.",
            },
          },
        });
        await tx
          .update(labRuns)
          .set({
            ...noAction,
            status: "accepted",
            reviewReason: null,
            completedAt: eventTime(row),
          })
          .where(eq(labRuns.id, runId));
        await audit(
          tx,
          row,
          "reconciled",
          "Original fulfillment recovered",
          "Matched the original warehouse reference by lookup. No duplicate submission was needed.",
          "success",
        );
      } else if (result.kind === "not_found") {
        await requireReview(
          tx,
          row,
          "Warehouse lookup returned not found. This does not rule out an in-flight or late-accepted request; automatic resubmission is blocked.",
        );
      } else if (row.run.lookupCount >= MAX_LOOKUPS) {
        await requireReview(
          tx,
          row,
          "Three lookup attempts could not establish the outcome. Escalated for human review without another submission.",
        );
      } else {
        await audit(
          tx,
          row,
          "lookup_unavailable",
          "Warehouse status is still unavailable",
          "Lookup failed or returned invalid evidence. Only another read-only lookup may be attempted.",
          "warning",
        );
        await scheduleAction(
          tx,
          boss,
          row,
          "lookup",
          retryDelayMs(row.run.lookupCount),
          `Lookup ${row.run.lookupCount}/${MAX_LOOKUPS} did not establish an outcome.`,
        );
      }
    });
  });
}

/** Coalesced operator request: only a GET lookup, never a force-retry endpoint. */
export async function requestLookup(
  resources: Resources,
  boss: PgBoss,
  runId: string,
) {
  z.uuid().parse(runId);
  return withRunLock(resources, runId, () =>
    resources.db.transaction(async (tx) => {
      const row = await loadRun(tx, runId);
      if (row.run.pendingAction)
        return { scheduled: false, reason: "Recovery already scheduled" };
      if (
        !["unknown", "unavailable"].includes(row.run.status) ||
        row.run.reviewReason ||
        row.run.lookupCount >= MAX_LOOKUPS
      )
        return {
          scheduled: false,
          reason: "No safe lookup action is available",
        };
      await scheduleAction(
        tx,
        boss,
        row,
        "lookup",
        0,
        "Operator requested a read-only check of the original reference.",
      );
      return { scheduled: true, reason: "Read-only lookup queued" };
    }),
  );
}

/** Durable minutely backstop, also queued at worker startup. Never scans fixtures
 * or non-lab orders. Per-run failures are isolated and the scan fails for redelivery.
 */
export async function reconcileScan(resources: Resources, boss: PgBoss) {
  const rows = await resources.db
    .select({ id: labRuns.id })
    .from(labRuns)
    .where(inArray(labRuns.status, ["running", "unknown", "unavailable"]))
    .limit(100);
  let failed = false;
  for (const { id } of rows) {
    try {
      await withRunLock(resources, id, () =>
        resources.db.transaction(async (tx) => {
          const row = await loadRun(tx, id);
          if (row.run.reviewReason) return;
          if (row.run.status === "running") {
            const [last] = await attempts(tx, id);
            if (last && Date.now() - last.startedAt.getTime() > STALE_ACTION_MS)
              await recordInterrupted(tx, boss, row);
            return;
          }
          if (row.run.pendingAction) {
            if (
              row.run.nextActionAt &&
              Date.now() - row.run.nextActionAt.getTime() > STALE_ACTION_MS
            ) {
              await scheduleAction(
                tx,
                boss,
                row,
                row.run.pendingAction,
                0,
                "Reconciliation re-armed an overdue action with a fresh delivery ID; older jobs are now fenced out.",
              );
            }
          } else if (
            row.run.status === "unknown" ||
            row.run.status === "unavailable"
          ) {
            // Historical Patch 003 failures get investigation, not retroactive POST retries.
            if (row.run.lookupCount >= MAX_LOOKUPS)
              await requireReview(
                tx,
                row,
                "No lookup budget remains. Manual investigation required.",
              );
            else
              await scheduleAction(
                tx,
                boss,
                row,
                "lookup",
                0,
                "Periodic reconciliation discovered an unresolved run without a pending recovery action.",
              );
          }
        }),
      );
    } catch (error) {
      if (!(error instanceof RunBusyError)) failed = true;
    }
  }
  if (failed)
    throw new Error(
      "One or more reconciliation rows could not be processed; scan will be retried",
    );
}
