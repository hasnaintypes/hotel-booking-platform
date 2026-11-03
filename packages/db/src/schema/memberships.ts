import { index, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organisationRoles, organisations } from "./organisations.js";
import { users } from "./users.js";

/**
 * Links a user to an organisation with exactly one role. A user can belong to several
 * organisations; the composite primary key prevents duplicate memberships. Deleting a user or
 * organisation removes the membership, while a role in use cannot be deleted.
 */
export const memberships = pgTable(
  "memberships",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    roleKey: text("role_key")
      .notNull()
      .references(() => organisationRoles.roleKey, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.organisationId] }),
    index("memberships_organisation_idx").on(table.organisationId),
    index("memberships_role_idx").on(table.roleKey),
  ],
);

export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;
