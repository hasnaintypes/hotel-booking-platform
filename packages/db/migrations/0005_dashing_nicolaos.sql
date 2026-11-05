CREATE TYPE "public"."inventory_source" AS ENUM('managed', 'supplier');--> statement-breakpoint
CREATE TYPE "public"."ledger_entry_type" AS ENUM('charge', 'refund', 'fee', 'adjustment', 'payable', 'settlement');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'authorized', 'paid', 'failed', 'refunded');--> statement-breakpoint
ALTER TYPE "public"."booking_status" ADD VALUE 'refunded';--> statement-breakpoint
CREATE TABLE "booking_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"from_status" "booking_status",
	"to_status" "booking_status" NOT NULL,
	"actor_user_id" uuid,
	"reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_events_transition_check" CHECK ("booking_events"."from_status" is null or "booking_events"."from_status" <> "booking_events"."to_status"),
	CONSTRAINT "booking_events_metadata_check" CHECK (jsonb_typeof("booking_events"."metadata") = 'object')
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"payment_id" uuid,
	"entry_type" "ledger_entry_type" NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency_code" char(3) NOT NULL,
	"fx_rate_snapshot_id" uuid,
	"description" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_amount_check" CHECK ("ledger_entries"."amount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_payment_id" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency_code" char(3) NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"original_payment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_check" CHECK ("payments"."amount_minor" >= 0),
	CONSTRAINT "payments_provider_check" CHECK (length("payments"."provider") > 0),
	CONSTRAINT "payments_provider_payment_id_check" CHECK (length("payments"."provider_payment_id") > 0),
	CONSTRAINT "payments_original_payment_check" CHECK ("payments"."original_payment_id" is null or "payments"."original_payment_id" <> "payments"."id")
);
--> statement-breakpoint
ALTER TABLE "bookings" RENAME COLUMN "user_id" TO "owner_user_id";--> statement-breakpoint
ALTER TABLE "bookings" RENAME CONSTRAINT "bookings_user_id_users_id_fk" TO "bookings_owner_user_id_users_id_fk";--> statement-breakpoint
DROP INDEX "bookings_user_created_at_idx";--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "public_reference" text DEFAULT lower(replace(gen_random_uuid()::text, '-', '')) NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "inventory_source" "inventory_source" DEFAULT 'managed' NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "supplier_id" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "supplier_reference" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "guest_first_name" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "guest_last_name" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "guest_email" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "guest_phone" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "adult_count" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "child_count" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "total_amount_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "currency_code" char(3) DEFAULT 'GBP' NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "price_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "cancellation_policy_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "special_requests" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "booking_events" ADD CONSTRAINT "booking_events_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_events" ADD CONSTRAINT "booking_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_currency_code_currencies_code_fk" FOREIGN KEY ("currency_code") REFERENCES "public"."currencies"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_fx_rate_snapshot_id_fx_rate_snapshots_id_fk" FOREIGN KEY ("fx_rate_snapshot_id") REFERENCES "public"."fx_rate_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_currency_code_currencies_code_fk" FOREIGN KEY ("currency_code") REFERENCES "public"."currencies"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_original_payment_id_payments_id_fk" FOREIGN KEY ("original_payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_events_booking_created_at_idx" ON "booking_events" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE INDEX "booking_events_actor_idx" ON "booking_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_booking_occurred_at_idx" ON "ledger_entries" USING btree ("booking_id","occurred_at");--> statement-breakpoint
CREATE INDEX "ledger_entries_payment_idx" ON "ledger_entries" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_type_occurred_at_idx" ON "ledger_entries" USING btree ("entry_type","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_payment_unique" ON "payments" USING btree ("provider","provider_payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_active_booking_payment_unique" ON "payments" USING btree ("booking_id") WHERE "payments"."original_payment_id" is null and "payments"."status" in ('pending', 'authorized', 'paid');--> statement-breakpoint
CREATE INDEX "payments_booking_created_at_idx" ON "payments" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE INDEX "payments_status_created_at_idx" ON "payments" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "payments_original_payment_idx" ON "payments" USING btree ("original_payment_id");--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_currency_code_currencies_code_fk" FOREIGN KEY ("currency_code") REFERENCES "public"."currencies"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_public_reference_unique" ON "bookings" USING btree ("public_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_owner_idempotency_unique" ON "bookings" USING btree ("owner_user_id","idempotency_key") WHERE "bookings"."idempotency_key" is not null and "bookings"."organisation_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_organisation_idempotency_unique" ON "bookings" USING btree ("organisation_id","idempotency_key") WHERE "bookings"."idempotency_key" is not null and "bookings"."organisation_id" is not null;--> statement-breakpoint
CREATE INDEX "bookings_owner_created_at_idx" ON "bookings" USING btree ("owner_user_id","created_at");--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_adult_count_check" CHECK ("bookings"."adult_count" between 1 and 50);--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_child_count_check" CHECK ("bookings"."child_count" between 0 and 50);--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_total_amount_check" CHECK ("bookings"."total_amount_minor" >= 0);--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_public_reference_check" CHECK ("bookings"."public_reference" ~ '^[a-z0-9]{16,64}$');--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_idempotency_key_check" CHECK ("bookings"."idempotency_key" is null or length("bookings"."idempotency_key") between 1 and 255);--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_supplier_fields_check" CHECK ((
        ("bookings"."inventory_source" = 'managed'
          and "bookings"."supplier_id" is null
          and "bookings"."supplier_reference" is null)
        or ("bookings"."inventory_source" = 'supplier'
          and "bookings"."supplier_id" is not null
          and "bookings"."supplier_reference" is not null)
      ));--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_price_snapshot_check" CHECK (jsonb_typeof("bookings"."price_snapshot") = 'object');--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_cancellation_policy_snapshot_check" CHECK ("bookings"."cancellation_policy_snapshot" is null
        or jsonb_typeof("bookings"."cancellation_policy_snapshot") = 'object');--> statement-breakpoint
CREATE TRIGGER "bookings_currency_enabled_check_trigger"
BEFORE INSERT OR UPDATE OF "currency_code" ON "bookings"
FOR EACH ROW EXECUTE FUNCTION "assert_currency_enabled"();--> statement-breakpoint
CREATE TRIGGER "payments_currency_enabled_check_trigger"
BEFORE INSERT OR UPDATE OF "currency_code" ON "payments"
FOR EACH ROW EXECUTE FUNCTION "assert_currency_enabled"();--> statement-breakpoint
CREATE TRIGGER "ledger_entries_currency_enabled_check_trigger"
BEFORE INSERT OR UPDATE OF "currency_code" ON "ledger_entries"
FOR EACH ROW EXECUTE FUNCTION "assert_currency_enabled"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION "reject_append_only_mutation"() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "ledger_entries_immutable_trigger"
BEFORE UPDATE OR DELETE ON "ledger_entries"
FOR EACH ROW EXECUTE FUNCTION "reject_append_only_mutation"();--> statement-breakpoint
CREATE TRIGGER "ledger_entries_no_truncate_trigger"
BEFORE TRUNCATE ON "ledger_entries"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_append_only_mutation"();--> statement-breakpoint
CREATE TRIGGER "booking_events_immutable_trigger"
BEFORE UPDATE OR DELETE ON "booking_events"
FOR EACH ROW EXECUTE FUNCTION "reject_append_only_mutation"();--> statement-breakpoint
CREATE TRIGGER "booking_events_no_truncate_trigger"
BEFORE TRUNCATE ON "booking_events"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_append_only_mutation"();
