import { and, eq, max, desc } from "drizzle-orm";
import type { createDatabase, Transaction } from "../db/client";
import {
  auditEvents,
  fulfillmentIntents,
  labRuns,
  orders,
  submissionAttempts,
  stores,
} from "../db/schema";
import { DEMO_SLUG } from "../db/seed";

export type Resources = ReturnType<typeof createDatabase>;
export async function loadRun(tx: Transaction, id: string) {
  const [row] = await tx
    .select({ run: labRuns, intent: fulfillmentIntents, order: orders })
    .from(labRuns)
    .innerJoin(fulfillmentIntents, eq(fulfillmentIntents.id, labRuns.intentId))
    .innerJoin(orders, eq(orders.id, fulfillmentIntents.orderId))
    .innerJoin(stores, eq(stores.id, labRuns.storeId))
    .where(and(eq(labRuns.id, id), eq(stores.slug, DEMO_SLUG)))
    .for("update", { of: [labRuns, fulfillmentIntents] });
  if (!row) throw new Error("Demo run not found");
  return row;
}
export type RunRow = Awaited<ReturnType<typeof loadRun>>;
export const noAction = {
  pendingAction: null,
  pendingActionId: null,
  nextActionAt: null,
};
export const eventTime = (row: RunRow) =>
  new Date(Math.max(Date.now(), row.intent.updatedAt.getTime()));
export async function attempts(tx: Transaction, runId: string) {
  return tx
    .select()
    .from(submissionAttempts)
    .where(eq(submissionAttempts.runId, runId))
    .orderBy(desc(submissionAttempts.attemptNumber));
}
export async function audit(
  tx: Transaction,
  row: RunRow,
  type: string,
  title: string,
  description: string,
  tone: "neutral" | "success" | "warning" = "neutral",
) {
  const [last] = await tx
    .select({ sequence: max(auditEvents.sequence) })
    .from(auditEvents)
    .where(eq(auditEvents.intentId, row.intent.id));
  await tx.insert(auditEvents).values({
    intentId: row.intent.id,
    sequence: (last.sequence ?? 0) + 1,
    actor: "recovery_worker",
    type,
    title,
    description,
    tone,
    occurredAt: eventTime(row),
  });
}
/** All submission and lookup paths share this process-lifetime per-run lock. */
export async function withRunLock<T>(
  resources: Resources,
  id: string,
  fn: () => Promise<T>,
) {
  const client = await resources.pool.connect();
  let locked = false;
  let broken = false;
  try {
    const result = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock(hashtextextended($1, 7303)) AS locked",
      [id],
    );
    locked = result.rows[0].locked;
    if (!locked) throw new RunBusyError();
    return await fn();
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
export class RunBusyError extends Error {
  constructor() {
    super("Run is being handled; try a later read");
  }
}
