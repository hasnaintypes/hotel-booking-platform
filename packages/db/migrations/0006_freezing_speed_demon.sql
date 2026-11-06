ALTER TABLE "hotels" ADD COLUMN "adult_count" smallint DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "hotels" ADD COLUMN "child_count" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "hotels" ADD COLUMN "contact_phone" text;--> statement-breakpoint
ALTER TABLE "hotels" ADD COLUMN "contact_email" text;--> statement-breakpoint
ALTER TABLE "hotels" ADD COLUMN "contact_website" text;--> statement-breakpoint
ALTER TABLE "hotels" ADD COLUMN "check_in_time" text;--> statement-breakpoint
ALTER TABLE "hotels" ADD COLUMN "check_out_time" text;--> statement-breakpoint
ALTER TABLE "hotels" ADD COLUMN "cancellation_policy" text;--> statement-breakpoint
ALTER TABLE "hotels" ADD COLUMN "pet_policy" text;--> statement-breakpoint
ALTER TABLE "hotels" ADD COLUMN "smoking_policy" text;--> statement-breakpoint
ALTER TABLE "hotels" ADD CONSTRAINT "hotels_adult_count_check" CHECK ("hotels"."adult_count" between 1 and 50);--> statement-breakpoint
ALTER TABLE "hotels" ADD CONSTRAINT "hotels_child_count_check" CHECK ("hotels"."child_count" between 0 and 50);