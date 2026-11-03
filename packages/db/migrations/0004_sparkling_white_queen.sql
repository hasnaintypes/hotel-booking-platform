CREATE TABLE "currencies" (
	"code" char(3) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"minor_unit_exponent" smallint NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "currencies_code_check" CHECK ("currencies"."code" ~ '^[A-Z]{3}$'),
	CONSTRAINT "currencies_minor_unit_exponent_check" CHECK ("currencies"."minor_unit_exponent" between 0 and 4)
);
--> statement-breakpoint
INSERT INTO "currencies" ("code", "name", "minor_unit_exponent", "enabled") VALUES
	('GBP', 'British Pound', 2, true),
	('USD', 'US Dollar', 2, false),
	('EUR', 'Euro', 2, false),
	('JPY', 'Japanese Yen', 0, false),
	('CHF', 'Swiss Franc', 2, false),
	('AUD', 'Australian Dollar', 2, false),
	('CAD', 'Canadian Dollar', 2, false),
	('CNY', 'Chinese Yuan', 2, false),
	('HKD', 'Hong Kong Dollar', 2, false),
	('INR', 'Indian Rupee', 2, false),
	('KRW', 'South Korean Won', 0, false),
	('NZD', 'New Zealand Dollar', 2, false),
	('SGD', 'Singapore Dollar', 2, false),
	('AED', 'UAE Dirham', 2, false),
	('ZAR', 'South African Rand', 2, false),
	('SEK', 'Swedish Krona', 2, false),
	('NOK', 'Norwegian Krone', 2, false),
	('DKK', 'Danish Krone', 2, false),
	('BRL', 'Brazilian Real', 2, false),
	('MXN', 'Mexican Peso', 2, false);--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"base_code" char(3) NOT NULL,
	"quote_code" char(3) NOT NULL,
	"rate" numeric(18, 8) NOT NULL,
	"source" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exchange_rates_rate_check" CHECK ("exchange_rates"."rate" > 0),
	CONSTRAINT "exchange_rates_pair_check" CHECK ("exchange_rates"."base_code" <> "exchange_rates"."quote_code"),
	CONSTRAINT "exchange_rates_validity_check" CHECK ("exchange_rates"."valid_to" is null or "exchange_rates"."valid_to" > "exchange_rates"."valid_from"),
	CONSTRAINT "exchange_rates_observed_check" CHECK ("exchange_rates"."observed_at" <= "exchange_rates"."valid_from")
);
--> statement-breakpoint
CREATE TABLE "fx_rate_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exchange_rate_id" uuid,
	"base_code" char(3) NOT NULL,
	"quote_code" char(3) NOT NULL,
	"rate" numeric(18, 8) NOT NULL,
	"source" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fx_rate_snapshots_rate_check" CHECK ("fx_rate_snapshots"."rate" > 0),
	CONSTRAINT "fx_rate_snapshots_pair_check" CHECK ("fx_rate_snapshots"."base_code" <> "fx_rate_snapshots"."quote_code"),
	CONSTRAINT "fx_rate_snapshots_validity_check" CHECK ("fx_rate_snapshots"."valid_to" is null or "fx_rate_snapshots"."valid_to" > "fx_rate_snapshots"."valid_from"),
	CONSTRAINT "fx_rate_snapshots_observed_check" CHECK ("fx_rate_snapshots"."observed_at" <= "fx_rate_snapshots"."valid_from")
);
--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_base_code_currencies_code_fk" FOREIGN KEY ("base_code") REFERENCES "public"."currencies"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_quote_code_currencies_code_fk" FOREIGN KEY ("quote_code") REFERENCES "public"."currencies"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fx_rate_snapshots" ADD CONSTRAINT "fx_rate_snapshots_exchange_rate_id_exchange_rates_id_fk" FOREIGN KEY ("exchange_rate_id") REFERENCES "public"."exchange_rates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fx_rate_snapshots" ADD CONSTRAINT "fx_rate_snapshots_base_code_currencies_code_fk" FOREIGN KEY ("base_code") REFERENCES "public"."currencies"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fx_rate_snapshots" ADD CONSTRAINT "fx_rate_snapshots_quote_code_currencies_code_fk" FOREIGN KEY ("quote_code") REFERENCES "public"."currencies"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "currencies_enabled_idx" ON "currencies" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "exchange_rates_pair_valid_from_idx" ON "exchange_rates" USING btree ("base_code","quote_code","valid_from");--> statement-breakpoint
CREATE INDEX "exchange_rates_observed_at_idx" ON "exchange_rates" USING btree ("observed_at");--> statement-breakpoint
CREATE INDEX "fx_rate_snapshots_pair_idx" ON "fx_rate_snapshots" USING btree ("base_code","quote_code");--> statement-breakpoint
CREATE INDEX "fx_rate_snapshots_exchange_rate_idx" ON "fx_rate_snapshots" USING btree ("exchange_rate_id");--> statement-breakpoint
ALTER TABLE "hotels" ADD CONSTRAINT "hotels_currency_code_currencies_code_fk" FOREIGN KEY ("currency_code") REFERENCES "public"."currencies"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "assert_currency_enabled"() RETURNS trigger AS $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM "currencies" WHERE "code" = NEW."currency_code" AND NOT "enabled"
	) THEN
		RAISE EXCEPTION 'currency % is not enabled', NEW."currency_code" USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "hotels_currency_enabled_check_trigger"
BEFORE INSERT OR UPDATE OF "currency_code" ON "hotels"
FOR EACH ROW EXECUTE FUNCTION "assert_currency_enabled"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION "reject_fx_rate_snapshot_mutation"() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'fx_rate_snapshots are immutable' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "fx_rate_snapshots_immutable_trigger"
BEFORE UPDATE OR DELETE ON "fx_rate_snapshots"
FOR EACH ROW EXECUTE FUNCTION "reject_fx_rate_snapshot_mutation"();--> statement-breakpoint
CREATE TRIGGER "fx_rate_snapshots_no_truncate_trigger"
BEFORE TRUNCATE ON "fx_rate_snapshots"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_fx_rate_snapshot_mutation"();
