CREATE TABLE "analytics_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" timestamp with time zone DEFAULT now() NOT NULL,
	"total_bookings" integer NOT NULL,
	"total_revenue_minor" bigint NOT NULL,
	"total_users" integer NOT NULL,
	"total_hotels" integer NOT NULL,
	"average_booking_value_minor" integer NOT NULL,
	"cancellation_rate" double precision NOT NULL,
	"average_rating" double precision NOT NULL,
	"by_status" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"by_payment_status" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"by_destination" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"by_hotel_type" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analytics_snapshots_total_bookings_check" CHECK ("analytics_snapshots"."total_bookings" >= 0),
	CONSTRAINT "analytics_snapshots_total_revenue_check" CHECK ("analytics_snapshots"."total_revenue_minor" >= 0),
	CONSTRAINT "analytics_snapshots_average_booking_value_check" CHECK ("analytics_snapshots"."average_booking_value_minor" >= 0),
	CONSTRAINT "analytics_snapshots_cancellation_rate_check" CHECK ("analytics_snapshots"."cancellation_rate" between 0 and 100),
	CONSTRAINT "analytics_snapshots_average_rating_check" CHECK ("analytics_snapshots"."average_rating" between 0 and 5)
);
--> statement-breakpoint
CREATE INDEX "analytics_snapshots_date_idx" ON "analytics_snapshots" USING btree ("date");--> statement-breakpoint
CREATE INDEX "bookings_created_at_idx" ON "bookings" USING btree ("created_at");