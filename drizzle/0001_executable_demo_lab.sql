CREATE TYPE "public"."lab_run_state" AS ENUM('queued', 'running', 'accepted', 'rejected', 'unavailable', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."lab_scenario" AS ENUM('accepted', 'address_rejected', 'unavailable', 'accepted_timeout');--> statement-breakpoint
CREATE TABLE "lab_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"intent_id" uuid NOT NULL,
	"scenario" "lab_scenario" NOT NULL,
	"status" "lab_run_state" DEFAULT 'queued' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "lab_runs_intent_id_unique" UNIQUE("intent_id"),
	CONSTRAINT "lab_completion_consistent" CHECK (("lab_runs"."status" IN ('queued','running') AND "lab_runs"."completed_at" IS NULL) OR ("lab_runs"."status" NOT IN ('queued','running') AND "lab_runs"."completed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "simulator_receipts" (
	"reference" text PRIMARY KEY NOT NULL,
	"warehouse_reference" uuid DEFAULT gen_random_uuid() NOT NULL,
	"fingerprint" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "simulator_receipts_warehouse_reference_unique" UNIQUE("warehouse_reference")
);
--> statement-breakpoint
CREATE TABLE "submission_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"result" text DEFAULT 'pending' NOT NULL,
	CONSTRAINT "submission_attempts_run_id_unique" UNIQUE("run_id"),
	CONSTRAINT "attempt_result_known" CHECK ("submission_attempts"."result" IN ('pending','accepted','rejected','unavailable','unknown','interrupted'))
);
--> statement-breakpoint
ALTER TABLE "lab_runs" ADD CONSTRAINT "lab_runs_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_runs" ADD CONSTRAINT "lab_runs_intent_id_fulfillment_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."fulfillment_intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_attempts" ADD CONSTRAINT "submission_attempts_run_id_lab_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."lab_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lab_runs_store_created_idx" ON "lab_runs" USING btree ("store_id","created_at");