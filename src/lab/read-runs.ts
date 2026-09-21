import { desc, eq, inArray, asc } from "drizzle-orm";
import type { Database } from "../db/client";
import {
  auditEvents,
  fulfillmentIntents,
  labRuns,
  orders,
  stores,
  submissionAttempts,
} from "../db/schema";
import { DEMO_SLUG } from "../db/seed";
import type { LabRun } from "./contracts";

export async function readRuns(db: Database): Promise<LabRun[]> {
  return db.transaction(
    async (tx) => {
      const rows = await tx
        .select({
          run: labRuns,
          intent: fulfillmentIntents,
          order: orders,
          attempt: submissionAttempts,
        })
        .from(labRuns)
        .innerJoin(stores, eq(stores.id, labRuns.storeId))
        .innerJoin(
          fulfillmentIntents,
          eq(fulfillmentIntents.id, labRuns.intentId),
        )
        .innerJoin(orders, eq(orders.id, fulfillmentIntents.orderId))
        .leftJoin(submissionAttempts, eq(submissionAttempts.runId, labRuns.id))
        .where(eq(stores.slug, DEMO_SLUG))
        .orderBy(desc(labRuns.createdAt))
        .limit(10);
      if (!rows.length) return [];
      const events = await tx
        .select()
        .from(auditEvents)
        .where(
          inArray(
            auditEvents.intentId,
            rows.map((r) => r.intent.id),
          ),
        )
        .orderBy(asc(auditEvents.sequence));
      return rows.map(({ run, intent, order, attempt }) => ({
        id: run.id,
        orderNumber: order.orderNumber,
        scenario: run.scenario,
        status: run.status,
        createdAt: run.createdAt.toISOString(),
        reference: intent.externalReference,
        warehouseReference: intent.warehouseReference,
        attemptCount: attempt ? 1 : 0,
        events: events
          .filter((e) => e.intentId === intent.id)
          .map((e) => ({
            id: e.id,
            time: e.occurredAt.toISOString().slice(11, 19),
            occurredAt: e.occurredAt.toISOString(),
            title: e.title,
            description: e.description,
            tone: e.tone,
          })),
      }));
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
