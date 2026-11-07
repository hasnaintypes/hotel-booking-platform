ALTER TABLE "booking_events" DROP CONSTRAINT "booking_events_transition_check";--> statement-breakpoint
ALTER TABLE "booking_events" ALTER COLUMN "from_status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "booking_events" ALTER COLUMN "to_status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."booking_status";--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('pending_payment', 'authorized', 'confirming', 'confirmed', 'cancelling', 'cancelled', 'failed', 'expired', 'needs_review');--> statement-breakpoint
ALTER TABLE "booking_events" ALTER COLUMN "from_status" SET DATA TYPE "public"."booking_status" USING (
  CASE "from_status"
    WHEN 'pending' THEN 'pending_payment'
    WHEN 'completed' THEN 'confirmed'
    WHEN 'refunded' THEN 'cancelled'
    ELSE "from_status"
  END
)::"public"."booking_status";--> statement-breakpoint
ALTER TABLE "booking_events" ALTER COLUMN "to_status" SET DATA TYPE "public"."booking_status" USING (
  CASE "to_status"
    WHEN 'pending' THEN 'pending_payment'
    WHEN 'completed' THEN 'confirmed'
    WHEN 'refunded' THEN 'cancelled'
    ELSE "to_status"
  END
)::"public"."booking_status";--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "status" SET DATA TYPE "public"."booking_status" USING (
  CASE "status"
    WHEN 'pending' THEN 'pending_payment'
    WHEN 'completed' THEN 'confirmed'
    WHEN 'refunded' THEN 'cancelled'
    ELSE "status"
  END
)::"public"."booking_status";--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "status" SET DEFAULT 'pending_payment'::"public"."booking_status";--> statement-breakpoint
ALTER TABLE "booking_events" ADD COLUMN "request_id" text;--> statement-breakpoint
CREATE INDEX "booking_events_request_idx" ON "booking_events" USING btree ("request_id");--> statement-breakpoint
ALTER TABLE "booking_events" ADD CONSTRAINT "booking_events_transition_check" CHECK ("booking_events"."from_status" is null or "booking_events"."from_status" <> "booking_events"."to_status");
