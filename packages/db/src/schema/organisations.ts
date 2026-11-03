import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** Organisation lifecycle. Suspended organisations keep their data but lose member access. */
export const organisationStatus = pgEnum("organisation_status", ["active", "suspended"]);

/**
 * A B2B customer such as an agency or hotel group. Ownership of hotels and bookings points here
 * when the resource belongs to an organisation rather than an individual user.
 */
export const organisations = pgTable(
  "organisations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    status: organisationStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("organisations_slug_unique").on(table.slug),
    check("organisations_slug_check", sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    index("organisations_status_idx").on(table.status),
  ],
);

/**
 * Roles are data so new membership roles can be added without changing the memberships shape.
 * The seeded rows (`owner`, `manager`, `member`, `viewer`) are the supported set for M1.
 */
export const organisationRoles = pgTable(
  "organisation_roles",
  {
    roleKey: text("role_key").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [check("organisation_roles_key_check", sql`${table.roleKey} ~ '^[a-z][a-z0-9_]*$'`)],
);

/**
 * Role-to-permission mapping. Permission codes are TypeScript constants in `authz.ts`; the
 * database check keeps the stored mappings inside that vocabulary so a typo cannot create a
 * grant that no code path understands.
 */
export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleKey: text("role_key")
      .notNull()
      .references(() => organisationRoles.roleKey, { onDelete: "cascade" }),
    permission: text("permission").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.roleKey, table.permission] }),
    check(
      "role_permissions_permission_check",
      sql`${table.permission} in (
        'hotel:read', 'hotel:create', 'hotel:update', 'hotel:delete',
        'booking:read', 'booking:create', 'booking:update', 'booking:cancel',
        'organisation:read', 'organisation:manage', 'membership:manage'
      )`,
    ),
    index("role_permissions_permission_idx").on(table.permission),
  ],
);

export type Organisation = typeof organisations.$inferSelect;
export type NewOrganisation = typeof organisations.$inferInsert;
export type OrganisationRole = typeof organisationRoles.$inferSelect;
export type NewOrganisationRole = typeof organisationRoles.$inferInsert;
export type RolePermission = typeof rolePermissions.$inferSelect;
export type NewRolePermission = typeof rolePermissions.$inferInsert;
