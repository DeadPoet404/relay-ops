import { eq, sql } from "drizzle-orm";
import { fromDrizzle, type PgBoss } from "pg-boss";
import type { Transaction } from "../db/client";
import { labRuns } from "../db/schema";
import { applyFulfillmentEventInTransaction } from "../db/apply-event";
import { RECOVERY_QUEUE } from "../queue/boss";
import { audit, eventTime, noAction, type RunRow } from "./state";

export async function scheduleAction(
  tx: Transaction,
  boss: PgBoss,
  row: RunRow,
  kind: "retry" | "lookup",
  delayMs: number,
  reason: string,
) {
  const id = crypto.randomUUID();
  const due = new Date(Date.now() + delayMs);
  await tx
    .update(labRuns)
    .set({ pendingAction: kind, pendingActionId: id, nextActionAt: due })
    .where(eq(labRuns.id, row.run.id));
  const job = await boss.send(
    RECOVERY_QUEUE,
    { runId: row.run.id, actionId: id },
    { id, startAfter: due, db: fromDrizzle(tx, sql) },
  );
  if (!job) throw new Error("Recovery job was not inserted");
  await audit(
    tx,
    row,
    `${kind}_scheduled`,
    kind === "retry" ? "Safe retry scheduled" : "Warehouse lookup scheduled",
    `${reason} Due ${due.toISOString()}. Action ${id}.`,
  );
  return id;
}
export async function requireReview(
  tx: Transaction,
  row: RunRow,
  reason: string,
) {
  if (
    row.intent.state !== "needs_review" &&
    row.intent.state !== "acknowledged"
  ) {
    await applyFulfillmentEventInTransaction(tx, {
      storeId: row.run.storeId,
      intentId: row.intent.id,
      expectedVersion: row.intent.version,
      occurredAt: eventTime(row),
      actor: "recovery_worker",
      event: { type: "review_required", reason },
    });
  }
  await tx
    .update(labRuns)
    .set({ ...noAction, reviewReason: reason })
    .where(eq(labRuns.id, row.run.id));
  await audit(
    tx,
    row,
    "recovery_escalated",
    "Human review required",
    reason,
    "warning",
  );
}
