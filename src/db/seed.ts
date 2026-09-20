import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { demoOrders } from "../lib/demo-data";
import {
  exceptionStatusFor,
  fulfillmentSnapshotSchema,
  type FulfillmentState,
} from "../domain/fulfillment";
import type { Database } from "./client";
import {
  stores,
  orders,
  fulfillmentIntents,
  exceptions,
  auditEvents,
} from "./schema";

export const DEMO_SLUG = "northline-demo";
export const DATASET_VERSION = "northline-v1";
export const SNAPSHOT_AT = new Date("2026-09-20T10:00:00.000Z");
const seedOrderSchema = z.object({
  orderNumber: z.string().regex(/^\d+$/),
  customer: z.string().min(1),
  email: z.email().endsWith("@example.com"),
  amountCents: z.number().int().nonnegative(),
  items: z.number().int().positive(),
});

/** Insert once in a transaction. Reruns never reset work or overwrite data. */
export async function seedDemo(db: Database) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(7302026001)`);
    const [existing] = await tx
      .select()
      .from(stores)
      .where(eq(stores.slug, DEMO_SLUG));
    if (existing) {
      if (existing.datasetVersion !== DATASET_VERSION)
        throw new Error(
          "Demo dataset version mismatch; refusing to overwrite existing data",
        );
      return { inserted: false, storeId: existing.id };
    }
    const [store] = await tx
      .insert(stores)
      .values({
        slug: DEMO_SLUG,
        name: "Northline Supply",
        datasetVersion: DATASET_VERSION,
        snapshotAt: SNAPSHOT_AT,
      })
      .returning();
    for (const fixture of demoOrders) {
      const validated = seedOrderSchema.parse(fixture);
      const openedAt = new Date(
        SNAPSHOT_AT.getTime() - fixture.ageMinutes * 60000,
      );
      const createdAt = new Date(openedAt.getTime() - 120000);
      const state: FulfillmentState =
        fixture.status === "resolved"
          ? "acknowledged"
          : fixture.status === "needs_review"
            ? "needs_review"
            : fixture.status === "retry_scheduled"
              ? "retry_scheduled"
              : "acknowledgement_unknown";
      const snapshot = fulfillmentSnapshotSchema.parse({
        state,
        externalReference: fixture.reference,
        warehouseReference:
          state === "acknowledged" ? `sim-wh-${fixture.orderNumber}` : null,
        version: 0,
      });
      const [order] = await tx
        .insert(orders)
        .values({
          storeId: store.id,
          sourceOrderId: `demo-shopify-${fixture.orderNumber}`,
          orderNumber: validated.orderNumber,
          customerName: validated.customer,
          customerEmail: validated.email,
          itemCount: validated.items,
          totalMinor: validated.amountCents,
          currency: "USD",
          createdAt,
        })
        .returning();
      const [intent] = await tx
        .insert(fulfillmentIntents)
        .values({
          orderId: order.id,
          ...snapshot,
          createdAt,
          updatedAt: new Date(`2026-09-20T${fixture.events.at(-1)!.time}:00Z`),
        })
        .returning();
      await tx.insert(exceptions).values({
        intentId: intent.id,
        kind: fixture.kind,
        status: exceptionStatusFor(state),
        openedAt,
        resolvedAt: state === "acknowledged" ? intent.updatedAt : null,
      });
      await tx.insert(auditEvents).values(
        fixture.events.map((event, index) => ({
          intentId: intent.id,
          sequence: index + 1,
          type: "seed_example",
          actor: "demo_seed",
          title: event.title,
          description: event.description,
          tone: event.tone,
          occurredAt: new Date(`2026-09-20T${event.time}:00Z`),
        })),
      );
    }
    return { inserted: true, storeId: store.id };
  });
}
