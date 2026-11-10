import { sql } from "drizzle-orm";
import {
  char,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { bookings } from "./bookings.js";
import { currencies } from "./currencies.js";
import { ledgerEntryType } from "./enums.js";
import { fxRateSnapshots } from "./fx-rate-snapshots.js";
import { payments } from "./payments.js";

/**
 * Append-only money ledger. A charge, refund, fee or adjustment is one row; the amount is always
 * non-negative and the entry type gives it direction. `source_key` makes retried provider effects
 * idempotent. `fx_rate_snapshot_id` records the exact rate used when the entry currency differs
 * from the booking currency. Payable and settlement types are reserved for future
 * merchant/settlement models.
 *
 * A database trigger rejects UPDATE, DELETE and TRUNCATE so history cannot be rewritten.
 */
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "restrict" }),
    paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "restrict" }),
    entryType: ledgerEntryType("entry_type").notNull(),
    sourceKey: text("source_key"),
    amountMinor: integer("amount_minor").notNull(),
    currencyCode: char("currency_code", { length: 3 })
      .notNull()
      .references(() => currencies.code, { onDelete: "restrict" }),
    fxRateSnapshotId: uuid("fx_rate_snapshot_id").references(() => fxRateSnapshots.id, {
      onDelete: "restrict",
    }),
    description: text("description"),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    check("ledger_entries_amount_check", sql`${table.amountMinor} >= 0`),
    check(
      "ledger_entries_source_key_check",
      sql`${table.sourceKey} is null or length(${table.sourceKey}) between 1 and 255`,
    ),
    uniqueIndex("ledger_entries_source_key_unique")
      .on(table.sourceKey)
      .where(sql`${table.sourceKey} is not null`),
    index("ledger_entries_booking_occurred_at_idx").on(table.bookingId, table.occurredAt),
    index("ledger_entries_payment_idx").on(table.paymentId),
    index("ledger_entries_type_occurred_at_idx").on(table.entryType, table.occurredAt),
  ],
);

export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type NewLedgerEntry = typeof ledgerEntries.$inferInsert;
