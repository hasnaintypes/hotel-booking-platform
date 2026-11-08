import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Inbound event deduplication. A provider event is recorded once by `(provider, event_id)` and the
 * same row is used to track processing, so replayed webhooks or duplicate job deliveries are safe.
 */
export const inboxEvents = pgTable(
  "inbox_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    eventType: text("event_type"),
    payload: jsonb("payload")
      .notNull()
      .default(sql`'{}'::jsonb`),
    receivedAt: timestamp("received_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    check("inbox_events_provider_check", sql`length(${table.provider}) between 1 and 100`),
    check("inbox_events_event_id_check", sql`length(${table.eventId}) between 1 and 255`),
    check("inbox_events_payload_check", sql`jsonb_typeof(${table.payload}) = 'object'`),
    uniqueIndex("inbox_events_provider_event_unique").on(table.provider, table.eventId),
    index("inbox_events_provider_received_idx").on(table.provider, table.receivedAt),
  ],
);

export type InboxEvent = typeof inboxEvents.$inferSelect;
export type NewInboxEvent = typeof inboxEvents.$inferInsert;
