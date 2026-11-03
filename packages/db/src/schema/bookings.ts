import { sql } from "drizzle-orm";
import { check, date, index, integer, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { bookingStatus } from "./enums.js";
import { hotels } from "./hotels.js";
import { organisations } from "./organisations.js";
import { users } from "./users.js";

/**
 * Booking identity, ownership and stay dates. `user_id` is the guest who owns the booking
 * directly; `organisation_id` marks a booking made on behalf of an organisation, and
 * `created_by_user_id` records who created the row (an agency member may create a booking for a
 * guest). M1-05 (#35) extends this table with money, supplier references, snapshots and
 * idempotency columns. It exists now so reviews can reference a real booking row.
 */
export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    hotelId: uuid("hotel_id")
      .notNull()
      .references(() => hotels.id, { onDelete: "restrict" }),
    organisationId: uuid("organisation_id").references(() => organisations.id, {
      onDelete: "restrict",
    }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    checkIn: date("check_in", { mode: "date" }).notNull(),
    checkOut: date("check_out", { mode: "date" }).notNull(),
    status: bookingStatus("status").notNull().default("pending"),
    version: integer("version").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    check("bookings_stay_dates_check", sql`${table.checkOut} > ${table.checkIn}`),
    check("bookings_version_check", sql`${table.version} >= 0`),
    index("bookings_user_created_at_idx").on(table.userId, table.createdAt),
    index("bookings_hotel_check_in_idx").on(table.hotelId, table.checkIn),
    index("bookings_status_created_at_idx").on(table.status, table.createdAt),
    index("bookings_organisation_created_at_idx").on(table.organisationId, table.createdAt),
    index("bookings_created_by_idx").on(table.createdByUserId),
  ],
);

export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;
