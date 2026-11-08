import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Transactional outbox for work that must be delivered after the business transaction commits.
 * Rows are written in the same transaction as the state change and relayed to the job queue by a
 * worker. `id` doubles as the queue job id, so relaying the same row twice is safe.
 */
export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    topic: text("topic").notNull(),
    payload: jsonb("payload")
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    check("outbox_events_topic_check", sql`length(${table.topic}) between 1 and 200`),
    check("outbox_events_payload_check", sql`jsonb_typeof(${table.payload}) = 'object'`),
    check(
      "outbox_events_status_check",
      sql`${table.status} in ('pending', 'dispatching', 'dispatched', 'failed')`,
    ),
    check("outbox_events_attempts_check", sql`${table.attempts} >= 0`),
    index("outbox_events_status_available_idx").on(table.status, table.availableAt),
    index("outbox_events_created_at_idx").on(table.createdAt),
  ],
);

export type OutboxEvent = typeof outboxEvents.$inferSelect;
export type NewOutboxEvent = typeof outboxEvents.$inferInsert;
