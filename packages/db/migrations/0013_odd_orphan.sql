CREATE TABLE "offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "inventory_source" DEFAULT 'managed' NOT NULL,
	"supplier_id" text,
	"supplier_offer_id" text,
	"hotel_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"check_in" date NOT NULL,
	"check_out" date NOT NULL,
	"adult_count" smallint NOT NULL,
	"child_count" smallint DEFAULT 0 NOT NULL,
	"currency_code" char(3) DEFAULT 'GBP' NOT NULL,
	"total_amount_minor" integer NOT NULL,
	"price_snapshot" jsonb NOT NULL,
	"cancellation_policy_snapshot" jsonb NOT NULL,
	"rate_options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"selected_rate_option_id" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offers_stay_dates_check" CHECK ("offers"."check_out" > "offers"."check_in"),
	CONSTRAINT "offers_adult_count_check" CHECK ("offers"."adult_count" between 1 and 50),
	CONSTRAINT "offers_child_count_check" CHECK ("offers"."child_count" between 0 and 50),
	CONSTRAINT "offers_total_amount_check" CHECK ("offers"."total_amount_minor" >= 0),
	CONSTRAINT "offers_currency_code_check" CHECK ("offers"."currency_code" ~ '^[A-Z]{3}$'),
	CONSTRAINT "offers_price_snapshot_check" CHECK (jsonb_typeof("offers"."price_snapshot") = 'object'),
	CONSTRAINT "offers_cancellation_policy_snapshot_check" CHECK (jsonb_typeof("offers"."cancellation_policy_snapshot") = 'object'),
	CONSTRAINT "offers_rate_options_check" CHECK (jsonb_typeof("offers"."rate_options") = 'array'),
	CONSTRAINT "offers_selected_rate_option_check" CHECK (length("offers"."selected_rate_option_id") between 1 and 100),
	CONSTRAINT "offers_metadata_check" CHECK (jsonb_typeof("offers"."metadata") = 'object'),
	CONSTRAINT "offers_expires_at_check" CHECK ("offers"."expires_at" > "offers"."created_at"),
	CONSTRAINT "offers_supplier_fields_check" CHECK ((
        ("offers"."source" = 'managed'
          and "offers"."supplier_id" is null
          and "offers"."supplier_offer_id" is null)
        or ("offers"."source" = 'supplier'
          and "offers"."supplier_id" is not null
          and "offers"."supplier_offer_id" is not null)
      ))
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "offer_id" uuid;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_currency_code_currencies_code_fk" FOREIGN KEY ("currency_code") REFERENCES "public"."currencies"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "offers_supplier_reference_unique" ON "offers" USING btree ("supplier_id","supplier_offer_id") WHERE "offers"."source" = 'supplier';--> statement-breakpoint
CREATE INDEX "offers_hotel_check_in_idx" ON "offers" USING btree ("hotel_id","check_in");--> statement-breakpoint
CREATE INDEX "offers_created_by_idx" ON "offers" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "offers_expires_at_idx" ON "offers" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_offer_id_unique" ON "bookings" USING btree ("offer_id") WHERE "bookings"."offer_id" is not null;