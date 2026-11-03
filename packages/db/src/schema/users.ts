import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { userRole, userStatus } from "./enums.js";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    role: userRole("role").notNull().default("user"),
    status: userStatus("status").notNull().default("active"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    image: text("image"),
    phone: text("phone"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    // Case-insensitive uniqueness: "Grace@example.com" and "grace@example.com" are one account.
    uniqueIndex("users_email_unique").on(sql`lower(${table.email})`),
    index("users_status_idx").on(table.status),
    index("users_created_at_idx").on(table.createdAt),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
