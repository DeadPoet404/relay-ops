ALTER TYPE "public"."lab_scenario" ADD VALUE 'temporary_outage';--> statement-breakpoint
ALTER TYPE "public"."lab_scenario" ADD VALUE 'lookup_unavailable';--> statement-breakpoint
CREATE TABLE "simulator_requests" (
	"reference" text PRIMARY KEY NOT NULL,
	"fingerprint" text NOT NULL,
	"scenario" "lab_scenario" NOT NULL,
	"submission_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "simulator_count_nonnegative" CHECK ("simulator_requests"."submission_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "submission_attempts" DROP CONSTRAINT "submission_attempts_run_id_unique";--> statement-breakpoint
ALTER TABLE "lab_runs" ADD COLUMN "pending_action" text;--> statement-breakpoint
ALTER TABLE "lab_runs" ADD COLUMN "pending_action_id" uuid;--> statement-breakpoint
ALTER TABLE "lab_runs" ADD COLUMN "next_action_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lab_runs" ADD COLUMN "lookup_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lab_runs" ADD COLUMN "review_reason" text;--> statement-breakpoint
ALTER TABLE "submission_attempts" ADD COLUMN "attempt_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "submission_attempts" ADD COLUMN "job_id" uuid;--> statement-breakpoint
-- Patch 003 used run IDs as submission job IDs. Preserve every historical claim.
UPDATE "submission_attempts" SET "job_id" = "run_id";--> statement-breakpoint
ALTER TABLE "submission_attempts" ALTER COLUMN "job_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "submission_attempts" ADD CONSTRAINT "submission_attempts_job_id_unique" UNIQUE("job_id");--> statement-breakpoint
ALTER TABLE "submission_attempts" ADD CONSTRAINT "attempt_run_number_unique" UNIQUE("run_id","attempt_number");--> statement-breakpoint
ALTER TABLE "lab_runs" ADD CONSTRAINT "pending_recovery_consistent" CHECK (("lab_runs"."pending_action" IS NULL AND "lab_runs"."pending_action_id" IS NULL AND "lab_runs"."next_action_at" IS NULL) OR ("lab_runs"."pending_action" IS NOT NULL AND "lab_runs"."pending_action" IN ('retry','lookup') AND "lab_runs"."pending_action_id" IS NOT NULL AND "lab_runs"."next_action_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "lab_runs" ADD CONSTRAINT "lookup_budget_bound" CHECK ("lab_runs"."lookup_count" >= 0 AND "lab_runs"."lookup_count" <= 3);--> statement-breakpoint
ALTER TABLE "submission_attempts" ADD CONSTRAINT "submission_budget_bound" CHECK ("submission_attempts"."attempt_number" >= 1 AND "submission_attempts"."attempt_number" <= 3);