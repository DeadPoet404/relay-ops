import { and, eq } from "drizzle-orm";
import type { Database } from "../db/client";
import {
  storefrontPurchases,
  labRuns,
  fulfillmentIntents,
  orders,
  stores,
} from "../db/schema";
import { DEMO_SLUG } from "../db/seed";
import { customerStatus, type StoreOrder } from "./cart";
export async function readStoreOrder(
  db: Database,
  id: string,
): Promise<StoreOrder | null> {
  const [row] = await db
    .select({ purchase: storefrontPurchases, run: labRuns, order: orders })
    .from(storefrontPurchases)
    .innerJoin(labRuns, eq(labRuns.id, storefrontPurchases.runId))
    .innerJoin(fulfillmentIntents, eq(fulfillmentIntents.id, labRuns.intentId))
    .innerJoin(orders, eq(orders.id, fulfillmentIntents.orderId))
    .innerJoin(stores, eq(stores.id, labRuns.storeId))
    .where(and(eq(labRuns.id, id), eq(stores.slug, DEMO_SLUG)));
  return row
    ? {
        id,
        number: row.order.orderNumber,
        items: row.purchase.items,
        totalMinor: row.order.totalMinor,
        createdAt: row.order.createdAt.toISOString(),
        status: customerStatus(row.run),
      }
    : null;
}
