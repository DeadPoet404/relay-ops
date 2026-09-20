import { asc, eq, inArray } from "drizzle-orm";
import type { Database } from "./client";
import {
  auditEvents,
  exceptions,
  fulfillmentIntents,
  orders,
  stores,
} from "./schema";
import { DEMO_SLUG } from "./seed";
import { exceptionStatusFor } from "../domain/fulfillment";
import type { ConsoleData } from "../lib/console-data";
import { scenarioDetails, type OrderException } from "../lib/demo-data";

export class DatasetNotSeededError extends Error {
  constructor() {
    super("Demo dataset not seeded");
    this.name = "DatasetNotSeededError";
  }
}

/** One repeatable-read snapshot for the store, rows, and audit events. */
export async function readConsole(
  db: Database,
  slug = DEMO_SLUG,
): Promise<ConsoleData> {
  return db.transaction(
    async (tx) => {
      const [store] = await tx
        .select()
        .from(stores)
        .where(eq(stores.slug, slug));
      if (!store) throw new DatasetNotSeededError();
      const rows = await tx
        .select({
          order: orders,
          intent: fulfillmentIntents,
          exception: exceptions,
        })
        .from(orders)
        .innerJoin(
          fulfillmentIntents,
          eq(fulfillmentIntents.orderId, orders.id),
        )
        .innerJoin(exceptions, eq(exceptions.intentId, fulfillmentIntents.id))
        .where(eq(orders.storeId, store.id))
        .orderBy(asc(exceptions.openedAt));
      const events = rows.length
        ? await tx
            .select()
            .from(auditEvents)
            .where(
              inArray(
                auditEvents.intentId,
                rows.map((row) => row.intent.id),
              ),
            )
            .orderBy(asc(auditEvents.sequence))
        : [];
      const byIntent = new Map<string, typeof events>();
      for (const event of events) {
        const group = byIntent.get(event.intentId) ?? [];
        group.push(event);
        byIntent.set(event.intentId, group);
      }
      const result: OrderException[] = rows.map(
        ({ order, intent, exception }) => {
          if (exception.status !== exceptionStatusFor(intent.state))
            throw new Error("Inconsistent exception and fulfillment states");
          const details = scenarioDetails[exception.kind];
          return {
            id: exception.id,
            orderNumber: order.orderNumber,
            customer: order.customerName,
            initials: order.customerName
              .split(" ")
              .map((part) => part[0])
              .join(""),
            email: order.customerEmail,
            items: order.itemCount,
            amountCents: order.totalMinor,
            status: exception.status,
            kind: exception.kind,
            ageMinutes: Math.max(
              0,
              Math.floor(
                (store.snapshotAt.getTime() - exception.openedAt.getTime()) /
                  60000,
              ),
            ),
            openedAt: exception.openedAt.toISOString().slice(11, 16),
            openedAtIso: exception.openedAt.toISOString(),
            reference: intent.externalReference,
            ...details,
            nextStep:
              exception.status === "resolved"
                ? `Acceptance is recorded against warehouse reference ${intent.warehouseReference}. No further action in this demonstration.`
                : details.nextStep,
            events: (byIntent.get(intent.id) ?? []).map((event) => ({
              id: event.id,
              time: event.occurredAt.toISOString().slice(11, 16),
              occurredAt: event.occurredAt.toISOString(),
              title: event.title,
              description: event.description,
              tone: event.tone,
            })),
          };
        },
      );
      return {
        source: "database",
        storeName: store.name,
        snapshotAt: store.snapshotAt.toISOString(),
        orders: result,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
