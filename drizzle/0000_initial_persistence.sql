CREATE TYPE "public"."event_tone" AS ENUM('neutral', 'warning', 'success');--> statement-breakpoint
CREATE TYPE "public"."exception_status" AS ENUM('needs_review', 'retry_scheduled', 'investigating', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."failure_kind" AS ENUM('address_rejected', 'warehouse_unavailable', 'acknowledgement_unknown');--> statement-breakpoint
CREATE TYPE "public"."fulfillment_state" AS ENUM('awaiting_submission', 'submitting', 'acknowledgement_unknown', 'retry_scheduled', 'needs_review', 'acknowledged');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intent_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"type" text NOT NULL,
	"actor" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"tone" "event_tone" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	CONSTRAINT "audit_intent_sequence_unique" UNIQUE("intent_id","sequence"),
	CONSTRAINT "audit_sequence_positive" CHECK ("audit_events"."sequence" > 0)
);
--> statement-breakpoint
CREATE TABLE "exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intent_id" uuid NOT NULL,
	"kind" "failure_kind" NOT NULL,
	"status" "exception_status" NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "exceptions_intent_id_unique" UNIQUE("intent_id"),
	CONSTRAINT "exception_resolution_consistent" CHECK (("exceptions"."status" = 'resolved' AND "exceptions"."resolved_at" IS NOT NULL AND "exceptions"."resolved_at" >= "exceptions"."opened_at") OR ("exceptions"."status" <> 'resolved' AND "exceptions"."resolved_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "fulfillment_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"external_reference" text NOT NULL,
	"state" "fulfillment_state" NOT NULL,
	"warehouse_reference" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "fulfillment_intents_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "fulfillment_intents_external_reference_unique" UNIQUE("external_reference"),
	CONSTRAINT "intent_version_nonnegative" CHECK ("fulfillment_intents"."version" >= 0),
	CONSTRAINT "acknowledged_has_reference" CHECK ("fulfillment_intents"."state" <> 'acknowledged' OR length(trim("fulfillment_intents"."warehouse_reference")) > 0 AND "fulfillment_intents"."warehouse_reference" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"source_order_id" text NOT NULL,
	"order_number" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_email" text NOT NULL,
	"item_count" integer NOT NULL,
	"total_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"payment_status" text DEFAULT 'paid' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "orders_store_source_unique" UNIQUE("store_id","source_order_id"),
	CONSTRAINT "orders_total_nonnegative" CHECK ("orders"."total_minor" >= 0),
	CONSTRAINT "orders_items_positive" CHECK ("orders"."item_count" > 0),
	CONSTRAINT "orders_currency_usd_demo" CHECK ("orders"."currency" = 'USD'),
	CONSTRAINT "orders_payment_demo" CHECK ("orders"."payment_status" = 'paid')
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"dataset_version" text NOT NULL,
	"snapshot_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stores_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_intent_id_fulfillment_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."fulfillment_intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exceptions" ADD CONSTRAINT "exceptions_intent_id_fulfillment_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."fulfillment_intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_intents" ADD CONSTRAINT "fulfillment_intents_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_intent_time_idx" ON "audit_events" USING btree ("intent_id","occurred_at");--> statement-breakpoint
CREATE INDEX "exceptions_status_opened_idx" ON "exceptions" USING btree ("status","opened_at");--> statement-breakpoint
CREATE INDEX "orders_store_idx" ON "orders" USING btree ("store_id");--> statement-breakpoint
-- Audit history is append-only for ordinary row operations. A privileged database
-- administrator can still truncate tables or disable triggers; this is not a
-- tamper-proof ledger. Integration tests use a dedicated disposable database.
CREATE FUNCTION relay_reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Relay audit events are append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION relay_reject_audit_mutation();
