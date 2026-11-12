CREATE TABLE "reconciliation_discrepancies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dedupe_key" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"provider" text DEFAULT 'stripe' NOT NULL,
	"booking_id" uuid,
	"payment_id" uuid,
	"provider_reference" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reconciliation_discrepancies_dedupe_key_check" CHECK (length("reconciliation_discrepancies"."dedupe_key") > 0),
	CONSTRAINT "reconciliation_discrepancies_kind_check" CHECK ("reconciliation_discrepancies"."kind" in (
        'payment_status_mismatch',
        'payment_amount_mismatch',
        'refund_mismatch',
        'local_without_provider',
        'provider_missing',
        'provider_without_local',
        'ledger_mismatch'
      )),
	CONSTRAINT "reconciliation_discrepancies_status_check" CHECK ("reconciliation_discrepancies"."status" in ('open', 'resolved', 'ignored')),
	CONSTRAINT "reconciliation_discrepancies_provider_check" CHECK (length("reconciliation_discrepancies"."provider") > 0),
	CONSTRAINT "reconciliation_discrepancies_provider_reference_check" CHECK ("reconciliation_discrepancies"."provider_reference" is null or length("reconciliation_discrepancies"."provider_reference") > 0),
	CONSTRAINT "reconciliation_discrepancies_details_check" CHECK (jsonb_typeof("reconciliation_discrepancies"."details") = 'object')
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reconciliation_discrepancies" ADD CONSTRAINT "reconciliation_discrepancies_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_discrepancies" ADD CONSTRAINT "reconciliation_discrepancies_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reconciliation_discrepancies_open_dedupe_unique" ON "reconciliation_discrepancies" USING btree ("dedupe_key") WHERE "reconciliation_discrepancies"."status" = 'open';--> statement-breakpoint
CREATE INDEX "reconciliation_discrepancies_status_detected_at_idx" ON "reconciliation_discrepancies" USING btree ("status","detected_at");--> statement-breakpoint
CREATE INDEX "reconciliation_discrepancies_booking_idx" ON "reconciliation_discrepancies" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "reconciliation_discrepancies_payment_idx" ON "reconciliation_discrepancies" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "bookings_status_expires_at_idx" ON "bookings" USING btree ("status","expires_at");--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_expires_at_check" CHECK ("bookings"."expires_at" is null or "bookings"."expires_at" > "bookings"."created_at");--> statement-breakpoint
-- Backfill live holds with the default 30-minute window. Rows that are already past it will be
-- closed by the next expiry run; the job also falls back to `created_at` for any null remains.
UPDATE "bookings"
   SET "expires_at" = "created_at" + interval '30 minutes'
 WHERE "status" = 'pending_payment' AND "expires_at" IS NULL;