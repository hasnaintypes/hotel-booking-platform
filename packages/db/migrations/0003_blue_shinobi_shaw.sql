CREATE TYPE "public"."organisation_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TABLE "memberships" (
	"user_id" uuid NOT NULL,
	"organisation_id" uuid NOT NULL,
	"role_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_user_id_organisation_id_pk" PRIMARY KEY("user_id","organisation_id")
);
--> statement-breakpoint
CREATE TABLE "organisation_roles" (
	"role_key" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organisation_roles_key_check" CHECK ("organisation_roles"."role_key" ~ '^[a-z][a-z0-9_]*$')
);
--> statement-breakpoint
CREATE TABLE "organisations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" "organisation_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organisations_slug_check" CHECK ("organisations"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_key" text NOT NULL,
	"permission" text NOT NULL,
	CONSTRAINT "role_permissions_role_key_permission_pk" PRIMARY KEY("role_key","permission"),
	CONSTRAINT "role_permissions_permission_check" CHECK ("role_permissions"."permission" in (
        'hotel:read', 'hotel:create', 'hotel:update', 'hotel:delete',
        'booking:read', 'booking:create', 'booking:update', 'booking:cancel',
        'organisation:read', 'organisation:manage', 'membership:manage'
      ))
);
--> statement-breakpoint
ALTER TABLE "hotels" DROP CONSTRAINT "hotels_managed_owner_check";--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "organisation_id" uuid;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "created_by_user_id" uuid;--> statement-breakpoint
UPDATE "bookings" SET "created_by_user_id" = "user_id" WHERE "created_by_user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "hotels" ADD COLUMN "organisation_id" uuid;--> statement-breakpoint
ALTER TABLE "hotels" ADD COLUMN "created_by_user_id" uuid;--> statement-breakpoint
UPDATE "hotels" SET "created_by_user_id" = "owner_user_id" WHERE "created_by_user_id" IS NULL AND "owner_user_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_role_key_organisation_roles_role_key_fk" FOREIGN KEY ("role_key") REFERENCES "public"."organisation_roles"("role_key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_key_organisation_roles_role_key_fk" FOREIGN KEY ("role_key") REFERENCES "public"."organisation_roles"("role_key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memberships_organisation_idx" ON "memberships" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "memberships_role_idx" ON "memberships" USING btree ("role_key");--> statement-breakpoint
CREATE UNIQUE INDEX "organisations_slug_unique" ON "organisations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "organisations_status_idx" ON "organisations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "role_permissions_permission_idx" ON "role_permissions" USING btree ("permission");--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "created_by_user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotels" ADD CONSTRAINT "hotels_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotels" ADD CONSTRAINT "hotels_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_organisation_created_at_idx" ON "bookings" USING btree ("organisation_id","created_at");--> statement-breakpoint
CREATE INDEX "bookings_created_by_idx" ON "bookings" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "hotels_organisation_idx" ON "hotels" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "hotels_created_by_idx" ON "hotels" USING btree ("created_by_user_id");--> statement-breakpoint
ALTER TABLE "hotels" ADD CONSTRAINT "hotels_managed_creator_check" CHECK ("hotels"."source" <> 'managed' or "hotels"."created_by_user_id" is not null);--> statement-breakpoint
ALTER TABLE "hotels" ADD CONSTRAINT "hotels_managed_owner_check" CHECK ("hotels"."source" <> 'managed' or "hotels"."owner_user_id" is not null or "hotels"."organisation_id" is not null);--> statement-breakpoint
INSERT INTO "organisation_roles" ("role_key", "name", "description") VALUES
	('owner', 'Owner', 'Full control of the organisation, its members and its resources'),
	('manager', 'Manager', 'Manages hotels and bookings but cannot delete hotels or manage members'),
	('member', 'Member', 'Creates and manages bookings and reads hotel data'),
	('viewer', 'Viewer', 'Read-only access to hotels, bookings and organisation details');--> statement-breakpoint
INSERT INTO "role_permissions" ("role_key", "permission") VALUES
	('owner', 'hotel:read'), ('owner', 'hotel:create'), ('owner', 'hotel:update'),
	('owner', 'hotel:delete'), ('owner', 'booking:read'), ('owner', 'booking:create'),
	('owner', 'booking:update'), ('owner', 'booking:cancel'), ('owner', 'organisation:read'),
	('owner', 'organisation:manage'), ('owner', 'membership:manage'),
	('manager', 'hotel:read'), ('manager', 'hotel:create'), ('manager', 'hotel:update'),
	('manager', 'booking:read'), ('manager', 'booking:create'), ('manager', 'booking:update'),
	('manager', 'booking:cancel'), ('manager', 'organisation:read'),
	('member', 'hotel:read'), ('member', 'booking:read'), ('member', 'booking:create'),
	('member', 'booking:update'), ('member', 'organisation:read'),
	('viewer', 'hotel:read'), ('viewer', 'booking:read'), ('viewer', 'organisation:read');
