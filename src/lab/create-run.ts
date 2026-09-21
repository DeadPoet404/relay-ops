import { eq, sql } from "drizzle-orm";
import { fromDrizzle, type PgBoss } from "pg-boss";
import { createRunSchema } from "./contracts";
import type { Database } from "../db/client";
import {
  auditEvents,
  fulfillmentIntents,
  labRuns,
  orders,
  stores,
  storefrontPurchases,
} from "../db/schema";
import { DEMO_SLUG } from "../db/seed";
import { priceCart, type Cart } from "../store/cart";
import { SUBMISSION_QUEUE } from "../queue/boss";

export class RequestConflictError extends Error {}
export class RunLimitError extends Error {}

export async function createRun(
  db: Database,
  boss: PgBoss,
  input: unknown,
  cart?: Cart,
) {
  const request = createRunSchema.parse(input);
  const purchase = cart === undefined ? null : priceCart(cart);
  return db.transaction(async (tx) => {
    // Serialize the tiny local lab to make repeat-request checks and a bounded
    // demo dataset race-safe. Never used as a production merchant-wide lock.
    await tx.execute(sql`select pg_advisory_xact_lock(7302026003)`);
    const [existing] = await tx
      .select()
      .from(labRuns)
      .where(eq(labRuns.id, request.requestId));
    if (existing) {
      const [priorPurchase] = await tx
        .select()
        .from(storefrontPurchases)
        .where(eq(storefrontPurchases.runId, existing.id));
      if (
        existing.scenario !== request.scenario ||
        (priorPurchase?.cartFingerprint ?? null) !==
          (purchase?.fingerprint ?? null)
      )
        throw new RequestConflictError(
          "Request ID already used for another scenario or cart",
        );
      return { runId: existing.id, duplicate: true };
    }
    const [store] = await tx
      .select()
      .from(stores)
      .where(eq(stores.slug, DEMO_SLUG));
    if (!store) throw new Error("Seed the demo store first");
    const [{ total }] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(labRuns)
      .where(eq(labRuns.storeId, store.id));
    if (total >= 100)
      throw new RunLimitError(
        "This local lab is capped at 100 runs. Preserve the evidence; do not reset the database blindly.",
      );
    const now = new Date();
    const [order] = await tx
      .insert(orders)
      .values({
        storeId: store.id,
        sourceOrderId: `lab-${request.requestId}`,
        orderNumber: `${purchase ? "NL" : "LAB"}-${request.requestId.slice(0, 8).toUpperCase()}`,
        customerName: purchase ? "Alex Morgan (demo)" : "Demo Customer",
        customerEmail: "demo.customer@example.com",
        itemCount: purchase?.itemCount ?? 1,
        totalMinor: purchase?.totalMinor ?? 12900,
        currency: "USD",
        paymentStatus: "paid",
        createdAt: now,
      })
      .returning();
    const [intent] = await tx
      .insert(fulfillmentIntents)
      .values({
        orderId: order.id,
        externalReference: `relay-lab-${request.requestId}`,
        state: "awaiting_submission",
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    await tx.insert(labRuns).values({
      id: request.requestId,
      storeId: store.id,
      intentId: intent.id,
      scenario: request.scenario,
      createdAt: now,
    });
    if (purchase)
      await tx
        .insert(storefrontPurchases)
        .values({
          runId: request.requestId,
          cartFingerprint: purchase.fingerprint,
          items: purchase.items,
        });
    await tx.insert(auditEvents).values({
      intentId: intent.id,
      sequence: 1,
      type: "demo_queued",
      actor: "local_demo",
      title: purchase
        ? "Storefront demo checkout completed"
        : "Demo order queued",
      description: purchase
        ? "Catalog-priced cart, synthetic paid order, and submission job committed together. No payment was charged."
        : "Synthetic paid order and submission job committed together. No Shopify payment occurred.",
      tone: "neutral",
      occurredAt: now,
    });
    const jobId = await boss.send(
      SUBMISSION_QUEUE,
      { runId: request.requestId },
      { id: request.requestId, db: fromDrizzle(tx, sql) },
    );
    if (!jobId) throw new Error("Queue insert did not return a job ID");
    return { runId: request.requestId, duplicate: false };
  });
}
