import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * ISO 4217 reference data. `minor_unit_exponent` says how many decimal places the currency's
 * minor unit has (GBP = 2, JPY = 0), so money stored as integer minor units can be formatted and
 * compared without floating point. Currencies other than GBP are present but disabled until
 * pricing and payments support them.
 */
export const currencies = pgTable(
  "currencies",
  {
    code: char("code", { length: 3 }).primaryKey(),
    name: text("name").notNull(),
    minorUnitExponent: smallint("minor_unit_exponent").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    check("currencies_code_check", sql`${table.code} ~ '^[A-Z]{3}$'`),
    check("currencies_minor_unit_exponent_check", sql`${table.minorUnitExponent} between 0 and 4`),
    index("currencies_enabled_idx").on(table.enabled),
  ],
);

export type Currency = typeof currencies.$inferSelect;
export type NewCurrency = typeof currencies.$inferInsert;
