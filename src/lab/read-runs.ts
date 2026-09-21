import { z } from "zod";
import { and, desc, eq, inArray, asc } from "drizzle-orm";
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

async function readRows(db: Database, id?: string): Promise<LabRun[]> {
  return db.transaction(
    async (tx) => {
      const rows = await tx
        .select({
          run: labRuns,
          intent: fulfillmentIntents,
          order: orders,
        })
        .from(labRuns)
        .innerJoin(stores, eq(stores.id, labRuns.storeId))
        .innerJoin(
          fulfillmentIntents,
          eq(fulfillmentIntents.id, labRuns.intentId),
        )
        .innerJoin(orders, eq(orders.id, fulfillmentIntents.orderId))
        .where(
          and(eq(stores.slug, DEMO_SLUG), id ? eq(labRuns.id, id) : undefined),
        )
        .orderBy(desc(labRuns.createdAt))
        .limit(id ? 1 : 10);
      if (!rows.length) return [];
      const history = await tx
        .select()
        .from(submissionAttempts)
        .where(
          inArray(
            submissionAttempts.runId,
            rows.map((r) => r.run.id),
          ),
        );
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
      return rows.map(({ run, intent, order }) => ({
        id: run.id,
        recoveredByLookup: events.some(
          (e) => e.intentId === intent.id && e.type === "reconciled",
        ),
        orderNumber: order.orderNumber,
        scenario: run.scenario,
        status: run.status,
        createdAt: run.createdAt.toISOString(),
        reference: intent.externalReference,
        warehouseReference: intent.warehouseReference,
        attemptCount: history.filter((attempt) => attempt.runId === run.id)
          .length,
        lookupCount: run.lookupCount,
        nextActionAt: run.nextActionAt?.toISOString() ?? null,
        pendingAction: run.pendingAction,
        pendingActionId: run.pendingActionId,
        reviewReason: run.reviewReason,
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

export function readRuns(db: Database) {
  return readRows(db);
}
/** Direct, demo-store-scoped read. Does not depend on the latest-ten window. */
export async function readRun(
  db: Database,
  id: string,
): Promise<LabRun | null> {
  z.uuid().parse(id);
  return (await readRows(db, id))[0] ?? null;
}
