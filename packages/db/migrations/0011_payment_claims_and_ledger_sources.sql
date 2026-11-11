ALTER TABLE "payments" DROP CONSTRAINT "payments_provider_payment_id_check";--> statement-breakpoint
DROP INDEX "payments_provider_payment_unique";--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "provider_payment_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "source_key" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "captured_amount_minor" integer;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "capture_method" text DEFAULT 'automatic' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "claim_token" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "claim_kind" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "claim_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "failure_code" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "failure_message" text;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_source_key_unique" ON "ledger_entries" USING btree ("source_key") WHERE "ledger_entries"."source_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_idempotency_key_unique" ON "payments" USING btree ("idempotency_key") WHERE "payments"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "payments_claim_expires_at_idx" ON "payments" USING btree ("claim_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_payment_unique" ON "payments" USING btree ("provider","provider_payment_id") WHERE "payments"."provider_payment_id" is not null;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_source_key_check" CHECK ("ledger_entries"."source_key" is null or length("ledger_entries"."source_key") between 1 and 255);--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_idempotency_key_check" CHECK ("payments"."idempotency_key" is null or length("payments"."idempotency_key") between 1 and 255);--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_capture_method_check" CHECK ("payments"."capture_method" in ('automatic', 'manual'));--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_captured_amount_check" CHECK ("payments"."captured_amount_minor" is null
        or ("payments"."captured_amount_minor" >= 0 and "payments"."captured_amount_minor" <= "payments"."amount_minor"));--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_claim_check" CHECK ((
        ("payments"."claim_token" is null
          and "payments"."claim_kind" is null
          and "payments"."claim_expires_at" is null)
        or ("payments"."claim_token" is not null
          and "payments"."claim_kind" in ('create', 'capture', 'refund')
          and "payments"."claim_expires_at" is not null)
      ));--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_provider_payment_id_check" CHECK ("payments"."provider_payment_id" is null or length("payments"."provider_payment_id") > 0);