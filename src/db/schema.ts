import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import {
  exceptionStatuses,
  failureKinds,
  fulfillmentStates,
} from "../domain/fulfillment";

export const fulfillmentState = pgEnum("fulfillment_state", fulfillmentStates);
export const failureKind = pgEnum("failure_kind", failureKinds);
export const exceptionStatus = pgEnum("exception_status", exceptionStatuses);
export const eventTone = pgEnum("event_tone", [
  "neutral",
  "warning",
  "success",
]);
const time = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });

export const stores = pgTable("stores", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  datasetVersion: text("dataset_version").notNull(),
  snapshotAt: time("snapshot_at").notNull(),
  createdAt: time("created_at").notNull().defaultNow(),
});

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id),
    sourceOrderId: text("source_order_id").notNull(),
    orderNumber: text("order_number").notNull(),
    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email").notNull(),
    itemCount: integer("item_count").notNull(),
    totalMinor: integer("total_minor").notNull(),
    currency: text("currency").notNull(),
    paymentStatus: text("payment_status").notNull().default("paid"),
    createdAt: time("created_at").notNull(),
  },
  (table) => [
    unique("orders_store_source_unique").on(table.storeId, table.sourceOrderId),
    check("orders_total_nonnegative", sql`${table.totalMinor} >= 0`),
    check("orders_items_positive", sql`${table.itemCount} > 0`),
    check("orders_currency_usd_demo", sql`${table.currency} = 'USD'`),
    check("orders_payment_demo", sql`${table.paymentStatus} = 'paid'`),
    index("orders_store_idx").on(table.storeId),
  ],
);

export const fulfillmentIntents = pgTable(
  "fulfillment_intents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .unique()
      .references(() => orders.id),
    externalReference: text("external_reference").notNull().unique(),
    state: fulfillmentState("state").notNull(),
    warehouseReference: text("warehouse_reference"),
    version: integer("version").notNull().default(0),
    createdAt: time("created_at").notNull(),
    updatedAt: time("updated_at").notNull(),
  },
  (table) => [
    check("intent_version_nonnegative", sql`${table.version} >= 0`),
    check(
      "acknowledged_has_reference",
      sql`${table.state} <> 'acknowledged' OR length(trim(${table.warehouseReference})) > 0 AND ${table.warehouseReference} IS NOT NULL`,
    ),
  ],
);

export const exceptions = pgTable(
  "exceptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    intentId: uuid("intent_id")
      .notNull()
      .unique()
      .references(() => fulfillmentIntents.id),
    kind: failureKind("kind").notNull(),
    status: exceptionStatus("status").notNull(),
    openedAt: time("opened_at").notNull(),
    resolvedAt: time("resolved_at"),
  },
  (table) => [
    check(
      "exception_resolution_consistent",
      sql`(${table.status} = 'resolved' AND ${table.resolvedAt} IS NOT NULL AND ${table.resolvedAt} >= ${table.openedAt}) OR (${table.status} <> 'resolved' AND ${table.resolvedAt} IS NULL)`,
    ),
    index("exceptions_status_opened_idx").on(table.status, table.openedAt),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    intentId: uuid("intent_id")
      .notNull()
      .references(() => fulfillmentIntents.id),
    sequence: integer("sequence").notNull(),
    type: text("type").notNull(),
    actor: text("actor").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    tone: eventTone("tone").notNull(),
    occurredAt: time("occurred_at").notNull(),
  },
  (table) => [
    unique("audit_intent_sequence_unique").on(table.intentId, table.sequence),
    check("audit_sequence_positive", sql`${table.sequence} > 0`),
    index("audit_intent_time_idx").on(table.intentId, table.occurredAt),
  ],
);
