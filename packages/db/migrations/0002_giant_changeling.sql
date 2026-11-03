CREATE TYPE "public"."booking_status" AS ENUM('pending', 'confirmed', 'cancelled', 'completed');--> statement-breakpoint
CREATE TYPE "public"."hotel_source" AS ENUM('managed', 'supplier');--> statement-breakpoint
CREATE TYPE "public"."hotel_status" AS ENUM('draft', 'active', 'inactive', 'archived');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"hotel_id" uuid NOT NULL,
	"check_in" date NOT NULL,
	"check_out" date NOT NULL,
	"status" "booking_status" DEFAULT 'pending' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_stay_dates_check" CHECK ("bookings"."check_out" > "bookings"."check_in"),
	CONSTRAINT "bookings_version_check" CHECK ("bookings"."version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "credentials" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"password_hash" text,
	"password_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hotel_facilities" (
	"hotel_id" uuid NOT NULL,
	"facility_id" uuid NOT NULL,
	CONSTRAINT "hotel_facilities_hotel_id_facility_id_pk" PRIMARY KEY("hotel_id","facility_id")
);
--> statement-breakpoint
CREATE TABLE "hotel_hotel_types" (
	"hotel_id" uuid NOT NULL,
	"hotel_type_id" uuid NOT NULL,
	CONSTRAINT "hotel_hotel_types_hotel_id_hotel_type_id_pk" PRIMARY KEY("hotel_id","hotel_type_id")
);
--> statement-breakpoint
CREATE TABLE "hotel_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hotel_id" uuid NOT NULL,
	"url" text NOT NULL,
	"alt_text" text,
	"position" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hotel_images_position_check" CHECK ("hotel_images"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "hotel_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hotels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "hotel_source" DEFAULT 'managed' NOT NULL,
	"owner_user_id" uuid,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"city" text NOT NULL,
	"country" text NOT NULL,
	"country_code" char(2) NOT NULL,
	"address_line1" text,
	"address_line2" text,
	"state" text,
	"postal_code" text,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"star_rating" smallint NOT NULL,
	"price_per_night_minor" integer NOT NULL,
	"currency_code" char(3) DEFAULT 'GBP' NOT NULL,
	"status" "hotel_status" DEFAULT 'draft' NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hotels_star_rating_check" CHECK ("hotels"."star_rating" between 1 and 5),
	CONSTRAINT "hotels_price_check" CHECK ("hotels"."price_per_night_minor" >= 0),
	CONSTRAINT "hotels_country_code_check" CHECK ("hotels"."country_code" ~ '^[A-Z]{2}$'),
	CONSTRAINT "hotels_currency_code_check" CHECK ("hotels"."currency_code" ~ '^[A-Z]{3}$'),
	CONSTRAINT "hotels_latitude_check" CHECK ("hotels"."latitude" is null or "hotels"."latitude" between -90 and 90),
	CONSTRAINT "hotels_longitude_check" CHECK ("hotels"."longitude" is null or "hotels"."longitude" between -180 and 180),
	CONSTRAINT "hotels_managed_owner_check" CHECK ("hotels"."source" <> 'managed' or "hotels"."owner_user_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "oauth_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"hotel_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"comment" text NOT NULL,
	"cleanliness" smallint NOT NULL,
	"service" smallint NOT NULL,
	"location" smallint NOT NULL,
	"value" smallint NOT NULL,
	"amenities" smallint NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"helpful_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_rating_check" CHECK ("reviews"."rating" between 1 and 5),
	CONSTRAINT "reviews_cleanliness_check" CHECK ("reviews"."cleanliness" between 1 and 5),
	CONSTRAINT "reviews_service_check" CHECK ("reviews"."service" between 1 and 5),
	CONSTRAINT "reviews_location_check" CHECK ("reviews"."location" between 1 and 5),
	CONSTRAINT "reviews_value_check" CHECK ("reviews"."value" between 1 and 5),
	CONSTRAINT "reviews_amenities_check" CHECK ("reviews"."amenities" between 1 and 5),
	CONSTRAINT "reviews_comment_check" CHECK (char_length("reviews"."comment") between 1 and 5000),
	CONSTRAINT "reviews_helpful_count_check" CHECK ("reviews"."helpful_count" >= 0)
);
--> statement-breakpoint
DROP INDEX "users_email_unique";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "user_role" DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status" "user_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "first_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "image" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_facilities" ADD CONSTRAINT "hotel_facilities_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_facilities" ADD CONSTRAINT "hotel_facilities_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_hotel_types" ADD CONSTRAINT "hotel_hotel_types_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_hotel_types" ADD CONSTRAINT "hotel_hotel_types_hotel_type_id_hotel_types_id_fk" FOREIGN KEY ("hotel_type_id") REFERENCES "public"."hotel_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_images" ADD CONSTRAINT "hotel_images_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotels" ADD CONSTRAINT "hotels_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_user_created_at_idx" ON "bookings" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "bookings_hotel_check_in_idx" ON "bookings" USING btree ("hotel_id","check_in");--> statement-breakpoint
CREATE INDEX "bookings_status_created_at_idx" ON "bookings" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "facilities_code_unique" ON "facilities" USING btree ("code");--> statement-breakpoint
CREATE INDEX "hotel_facilities_facility_idx" ON "hotel_facilities" USING btree ("facility_id");--> statement-breakpoint
CREATE INDEX "hotel_hotel_types_type_idx" ON "hotel_hotel_types" USING btree ("hotel_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hotel_images_hotel_url_unique" ON "hotel_images" USING btree ("hotel_id","url");--> statement-breakpoint
CREATE UNIQUE INDEX "hotel_images_hotel_position_unique" ON "hotel_images" USING btree ("hotel_id","position");--> statement-breakpoint
CREATE INDEX "hotel_images_hotel_idx" ON "hotel_images" USING btree ("hotel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hotel_types_code_unique" ON "hotel_types" USING btree ("code");--> statement-breakpoint
CREATE INDEX "hotels_city_trgm_idx" ON "hotels" USING gin (lower("city") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "hotels_country_trgm_idx" ON "hotels" USING gin (lower("country") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "hotels_country_code_idx" ON "hotels" USING btree ("country_code");--> statement-breakpoint
CREATE INDEX "hotels_price_idx" ON "hotels" USING btree ("price_per_night_minor");--> statement-breakpoint
CREATE INDEX "hotels_star_rating_idx" ON "hotels" USING btree ("star_rating");--> statement-breakpoint
CREATE INDEX "hotels_owner_idx" ON "hotels" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "hotels_status_idx" ON "hotels" USING btree ("status");--> statement-breakpoint
CREATE INDEX "hotels_city_star_rating_idx" ON "hotels" USING btree ("city","star_rating");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_accounts_provider_account_unique" ON "oauth_accounts" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE INDEX "oauth_accounts_user_idx" ON "oauth_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_booking_user_unique" ON "reviews" USING btree ("booking_id","user_id");--> statement-breakpoint
CREATE INDEX "reviews_hotel_created_at_idx" ON "reviews" USING btree ("hotel_id","created_at");--> statement-breakpoint
CREATE INDEX "reviews_hotel_rating_idx" ON "reviews" USING btree ("hotel_id","rating");--> statement-breakpoint
CREATE INDEX "reviews_user_created_at_idx" ON "reviews" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));