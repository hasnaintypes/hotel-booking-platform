import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { bookings } from "./bookings.js";
import { bookingStatus } from "./enums.js";
import { users } from "./users.js";

/**
 * Append-only booking state history. Every transition writes the previous and next status (a
 * creation has no previous status), the actor when a user caused it, and optional metadata.
 * A database trigger rejects UPDATE, DELETE and TRUNCATE so the audit trail stays intact.
 */
export const bookingEvents = pgTable(
  "booking_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "restrict" }),
    fromStatus: bookingStatus("from_status"),
    toStatus: bookingStatus("to_status").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
    reason: text("reason"),
    requestId: text("request_id"),
    metadata: jsonb("metadata")
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "booking_events_transition_check",
      // A transition always changes status. A note records an audit annotation at the current
      // status, so it stores `from_status = to_status` and carries `metadata.kind = 'note'`.
      // `coalesce` is required: a CHECK that evaluates to NULL passes, and `metadata->>'kind'`
      // is NULL for every ordinary event, so a bare equality would let same-status rows through.
      sql`${table.fromStatus} is null
        or ${table.fromStatus} <> ${table.toStatus}
        or coalesce(${table.metadata}->>'kind', '') = 'note'`,
    ),
    check("booking_events_metadata_check", sql`jsonb_typeof(${table.metadata}) = 'object'`),
    index("booking_events_booking_created_at_idx").on(table.bookingId, table.createdAt),
    index("booking_events_actor_idx").on(table.actorUserId),
    index("booking_events_request_idx").on(table.requestId),
  ],
);

export type BookingEvent = typeof bookingEvents.$inferSelect;
export type NewBookingEvent = typeof bookingEvents.$inferInsert;
