CREATE TABLE "storefront_purchases" (
	"run_id" uuid PRIMARY KEY NOT NULL,
	"cart_fingerprint" text NOT NULL,
	"items" jsonb NOT NULL,
	CONSTRAINT "storefront_items_array" CHECK (jsonb_typeof("storefront_purchases"."items") = 'array' AND jsonb_array_length("storefront_purchases"."items") BETWEEN 1 AND 4)
);
--> statement-breakpoint
ALTER TABLE "storefront_purchases" ADD CONSTRAINT "storefront_purchases_run_id_lab_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."lab_runs"("id") ON DELETE no action ON UPDATE no action;