ALTER TABLE "booking_events" DROP CONSTRAINT "booking_events_transition_check";--> statement-breakpoint
ALTER TABLE "reconciliation_discrepancies" ADD COLUMN "assigned_to_user_id" uuid;--> statement-breakpoint
ALTER TABLE "reconciliation_discrepancies" ADD COLUMN "assigned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reconciliation_discrepancies" ADD COLUMN "assigned_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "reconciliation_discrepancies" ADD COLUMN "resolved_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "reconciliation_discrepancies" ADD CONSTRAINT "reconciliation_discrepancies_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_discrepancies" ADD CONSTRAINT "reconciliation_discrepancies_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_discrepancies" ADD CONSTRAINT "reconciliation_discrepancies_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reconciliation_discrepancies_assigned_idx" ON "reconciliation_discrepancies" USING btree ("assigned_to_user_id","status");--> statement-breakpoint
ALTER TABLE "booking_events" ADD CONSTRAINT "booking_events_transition_check" CHECK ("booking_events"."from_status" is null
        or "booking_events"."from_status" <> "booking_events"."to_status"
        or coalesce("booking_events"."metadata"->>'kind', '') = 'note');--> statement-breakpoint
CREATE OR REPLACE FUNCTION "assert_booking_status_transition"() RETURNS trigger AS $$
BEGIN
  IF NEW."status" = OLD."status" THEN
    RETURN NEW;
  END IF;

  IF OLD."status"::text || '->' || NEW."status"::text IN (
    'pending_payment->authorized',
    'pending_payment->confirming',
    'pending_payment->cancelling',
    'pending_payment->failed',
    'pending_payment->expired',
    'pending_payment->cancelled',
    'pending_payment->needs_review',
    'authorized->confirming',
    'authorized->confirmed',
    'authorized->cancelling',
    'authorized->failed',
    'authorized->expired',
    'authorized->cancelled',
    'authorized->needs_review',
    'confirming->confirmed',
    'confirming->cancelling',
    'confirming->failed',
    'confirming->cancelled',
    'confirming->needs_review',
    'confirmed->cancelling',
    'confirmed->cancelled',
    'confirmed->needs_review',
    'cancelling->cancelled',
    'cancelling->needs_review',
    'cancelled->needs_review',
    'failed->needs_review',
    'expired->needs_review',
    'needs_review->pending_payment',
    'needs_review->authorized',
    'needs_review->confirming',
    'needs_review->confirmed',
    'needs_review->cancelling',
    'needs_review->cancelled',
    'needs_review->failed',
    'needs_review->expired'
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'illegal booking status transition: % -> %', OLD."status", NEW."status"
    USING ERRCODE = '23514', CONSTRAINT = 'bookings_status_transition_check';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "bookings_status_transition_trigger"
BEFORE UPDATE OF "status" ON "bookings"
FOR EACH ROW EXECUTE FUNCTION "assert_booking_status_transition"();
