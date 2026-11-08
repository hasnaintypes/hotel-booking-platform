CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"response" jsonb,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "idempotency_keys_scope_check" CHECK (length("idempotency_keys"."scope") between 1 and 200),
	CONSTRAINT "idempotency_keys_key_check" CHECK (length("idempotency_keys"."key") between 1 and 255),
	CONSTRAINT "idempotency_keys_request_hash_check" CHECK ("idempotency_keys"."request_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "idempotency_keys_status_check" CHECK ("idempotency_keys"."status" in ('in_progress', 'completed')),
	CONSTRAINT "idempotency_keys_response_check" CHECK ("idempotency_keys"."response" is null or jsonb_typeof("idempotency_keys"."response") = 'object'),
	CONSTRAINT "idempotency_keys_expiry_check" CHECK ("idempotency_keys"."expires_at" > "idempotency_keys"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_keys_scope_key_unique" ON "idempotency_keys" USING btree ("scope","key");--> statement-breakpoint
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idempotency_keys_status_locked_until_idx" ON "idempotency_keys" USING btree ("status","locked_until");