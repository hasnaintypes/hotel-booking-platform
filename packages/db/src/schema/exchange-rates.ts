import { sql } from "drizzle-orm";
import { char, check, index, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { currencies } from "./currencies.js";

/**
 * Provider-observed exchange rates. A row is valid for a window: it may be used when
 * `valid_from <= at` and `valid_to` is null or after `at`. Lookup chooses the latest applicable
 * row and rejects it when `observed_at` is older than the configured staleness limit.
 */
export const exchangeRates = pgTable(
  "exchange_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
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
    check("exchange_rates_rate_check", sql`${table.rate} > 0`),
    check("exchange_rates_pair_check", sql`${table.baseCode} <> ${table.quoteCode}`),
    check(
      "exchange_rates_validity_check",
      sql`${table.validTo} is null or ${table.validTo} > ${table.validFrom}`,
    ),
    check("exchange_rates_observed_check", sql`${table.observedAt} <= ${table.validFrom}`),
    index("exchange_rates_pair_valid_from_idx").on(
      table.baseCode,
      table.quoteCode,
      table.validFrom,
    ),
    index("exchange_rates_observed_at_idx").on(table.observedAt),
  ],
);

export type ExchangeRate = typeof exchangeRates.$inferSelect;
export type NewExchangeRate = typeof exchangeRates.$inferInsert;
