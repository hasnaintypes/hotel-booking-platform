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
 * Durable store for HTTP idempotency. `(scope, key)` is unique; `scope` includes the authenticated
 * principal so one user's key can never replay another user's response. A row starts as
 * `in_progress` with a short lease, then becomes `completed` with the stored response in the same
 * transaction as the business write.
 */
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: text("scope").notNull(),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    status: text("status").notNull().default("in_progress"),
    response: jsonb("response"),
    lockedUntil: timestamp("locked_until", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [
    check("idempotency_keys_scope_check", sql`length(${table.scope}) between 1 and 200`),
    check("idempotency_keys_key_check", sql`length(${table.key}) between 1 and 255`),
    check("idempotency_keys_request_hash_check", sql`${table.requestHash} ~ '^[a-f0-9]{64}$'`),
    check("idempotency_keys_status_check", sql`${table.status} in ('in_progress', 'completed')`),
    check(
      "idempotency_keys_response_check",
      sql`${table.response} is null or jsonb_typeof(${table.response}) = 'object'`,
    ),
    check("idempotency_keys_expiry_check", sql`${table.expiresAt} > ${table.createdAt}`),
    uniqueIndex("idempotency_keys_scope_key_unique").on(table.scope, table.key),
    index("idempotency_keys_expires_at_idx").on(table.expiresAt),
    index("idempotency_keys_status_locked_until_idx").on(table.status, table.lockedUntil),
  ],
);

export type IdempotencyKey = typeof idempotencyKeys.$inferSelect;
export type NewIdempotencyKey = typeof idempotencyKeys.$inferInsert;
