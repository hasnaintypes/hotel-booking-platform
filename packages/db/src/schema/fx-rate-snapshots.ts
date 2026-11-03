import { sql } from "drizzle-orm";
import { char, check, index, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { currencies } from "./currencies.js";
import { exchangeRates } from "./exchange-rates.js";

/**
 * Immutable copy of the rate used by a quote, price snapshot or ledger entry. The row copies the
 * base, quote, rate, source and validity window so later changes to `exchange_rates` cannot alter
 * historical money. A database trigger rejects UPDATE and DELETE.
 */
export const fxRateSnapshots = pgTable(
  "fx_rate_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    exchangeRateId: uuid("exchange_rate_id").references(() => exchangeRates.id, {
      onDelete: "restrict",
    }),
    baseCode: char("base_code", { length: 3 })
      .notNull()
      .references(() => currencies.code, { onDelete: "restrict" }),
    quoteCode: char("quote_code", { length: 3 })
      .notNull()
      .references(() => currencies.code, { onDelete: "restrict" }),
    rate: numeric("rate", { precision: 18, scale: 8 }).notNull(),
    source: text("source").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true, mode: "date" }).notNull(),
    validFrom: timestamp("valid_from", { withTimezone: true, mode: "date" }).notNull(),
    validTo: timestamp("valid_to", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    check("fx_rate_snapshots_rate_check", sql`${table.rate} > 0`),
    check("fx_rate_snapshots_pair_check", sql`${table.baseCode} <> ${table.quoteCode}`),
    check(
      "fx_rate_snapshots_validity_check",
      sql`${table.validTo} is null or ${table.validTo} > ${table.validFrom}`,
    ),
    check("fx_rate_snapshots_observed_check", sql`${table.observedAt} <= ${table.validFrom}`),
    index("fx_rate_snapshots_pair_idx").on(table.baseCode, table.quoteCode),
    index("fx_rate_snapshots_exchange_rate_idx").on(table.exchangeRateId),
  ],
);

export type FxRateSnapshot = typeof fxRateSnapshots.$inferSelect;
export type NewFxRateSnapshot = typeof fxRateSnapshots.$inferInsert;
