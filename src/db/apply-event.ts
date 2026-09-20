import { and, eq, lt, max } from "drizzle-orm";
import { z } from "zod";
import {
  exceptionStatusFor,
  fulfillmentEventSchema,
  transitionFulfillment,
} from "../domain/fulfillment";
import type { Database } from "./client";
import {
  auditEvents,
  exceptions,
  fulfillmentIntents,
  orders,
  stores,
} from "./schema";

const inputSchema = z
  .object({
    storeId: z.uuid(),
    intentId: z.uuid(),
    expectedVersion: z.number().int().nonnegative(),
    occurredAt: z.date(),
    actor: z.string().trim().min(1).max(100),
    event: fulfillmentEventSchema,
  })
  .strict();
export type ApplyEventInput = z.infer<typeof inputSchema>;
export class VersionConflictError extends Error {
  constructor() {
    super("Fulfillment changed; reload before retrying");
    this.name = "VersionConflictError";
  }
}

/** Internal service only. Not exposed via HTTP or server actions in increment 002.
 * Locks and version checks prevent two writers from applying the same transition.
 * This records state and audit history; it does NOT execute external side effects.
 */
export async function applyFulfillmentEvent(
  db: Database,
  rawInput: ApplyEventInput,
) {
  const input = inputSchema.parse(rawInput);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ intent: fulfillmentIntents })
      .from(fulfillmentIntents)
      .innerJoin(orders, eq(orders.id, fulfillmentIntents.orderId))
      .where(
        and(
          eq(fulfillmentIntents.id, input.intentId),
          eq(orders.storeId, input.storeId),
        ),
      )
      .for("update", { of: fulfillmentIntents });
    if (!row) throw new Error("Fulfillment not found in this store");
    if (row.intent.version !== input.expectedVersion)
      throw new VersionConflictError();
    if (input.occurredAt < row.intent.updatedAt)
      throw new Error("Out-of-order transition rejected; reconcile instead");
    const next = transitionFulfillment(row.intent, input.event);
    await tx
      .update(fulfillmentIntents)
      .set({ ...next, updatedAt: input.occurredAt })
      .where(eq(fulfillmentIntents.id, input.intentId));
    const [existing] = await tx
      .select()
      .from(exceptions)
      .where(eq(exceptions.intentId, input.intentId));
    const status = exceptionStatusFor(next.state);
    if (existing) {
      await tx
        .update(exceptions)
        .set({
          status,
          resolvedAt: status === "resolved" ? input.occurredAt : null,
        })
        .where(eq(exceptions.id, existing.id));
    } else if (
      ["acknowledgement_unknown", "retry_scheduled", "needs_review"].includes(
        next.state,
      )
    ) {
      await tx.insert(exceptions).values({
        intentId: input.intentId,
        status,
        openedAt: input.occurredAt,
        kind:
          input.event.type === "address_rejected"
            ? "address_rejected"
            : input.event.type === "retry_authorized"
              ? "warehouse_unavailable"
              : "acknowledgement_unknown",
      });
    }
    const [last] = await tx
      .select({ sequence: max(auditEvents.sequence) })
      .from(auditEvents)
      .where(eq(auditEvents.intentId, input.intentId));
    const detail =
      "evidence" in input.event
        ? `Reference ${input.event.evidence.reference}. ${input.event.type === "retry_authorized" ? `Retry basis: ${input.event.evidence.basis}. ` : ""}${input.event.evidence.detail}`
        : input.event.type === "review_required"
          ? input.event.reason
          : "Validated internal state transition. No external request was made by this service.";
    await tx.insert(auditEvents).values({
      intentId: input.intentId,
      sequence: (last.sequence ?? 0) + 1,
      type: input.event.type,
      actor: input.actor,
      title: input.event.type.replaceAll("_", " "),
      description: detail,
      tone:
        next.state === "acknowledged"
          ? "success"
          : next.state === "needs_review" ||
              next.state === "acknowledgement_unknown"
            ? "warning"
            : "neutral",
      occurredAt: input.occurredAt,
    });
    // Advance only the data's observation time, never the browser's wall clock.
    await tx
      .update(stores)
      .set({ snapshotAt: input.occurredAt })
      .where(
        and(
          eq(stores.id, input.storeId),
          lt(stores.snapshotAt, input.occurredAt),
        ),
      );
    return next;
  });
}
