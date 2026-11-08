CREATE TABLE "inbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "inbox_events_provider_check" CHECK (length("inbox_events"."provider") between 1 and 100),
	CONSTRAINT "inbox_events_event_id_check" CHECK (length("inbox_events"."event_id") between 1 and 255),
	CONSTRAINT "inbox_events_payload_check" CHECK (jsonb_typeof("inbox_events"."payload") = 'object')
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatched_at" timestamp with time zone,
	CONSTRAINT "outbox_events_topic_check" CHECK (length("outbox_events"."topic") between 1 and 200),
	CONSTRAINT "outbox_events_payload_check" CHECK (jsonb_typeof("outbox_events"."payload") = 'object'),
	CONSTRAINT "outbox_events_status_check" CHECK ("outbox_events"."status" in ('pending', 'dispatching', 'dispatched', 'failed')),
	CONSTRAINT "outbox_events_attempts_check" CHECK ("outbox_events"."attempts" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_events_provider_event_unique" ON "inbox_events" USING btree ("provider","event_id");--> statement-breakpoint
CREATE INDEX "inbox_events_provider_received_idx" ON "inbox_events" USING btree ("provider","received_at");--> statement-breakpoint
CREATE INDEX "outbox_events_status_available_idx" ON "outbox_events" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "outbox_events_created_at_idx" ON "outbox_events" USING btree ("created_at");