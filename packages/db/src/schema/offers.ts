import { sql } from "drizzle-orm";
import {
  char,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { currencies } from "./currencies.js";
import { inventorySource } from "./enums.js";
import { hotels } from "./hotels.js";
import { users } from "./users.js";

/**
 * A frozen, bookable price for one stay, regardless of where the inventory came from. Managed
 * offers are computed from the hotel's own rate until M8 adds real room inventory; supplier
 * offers arrive through the supplier-kit abstraction in M4.
 *
 * `price_snapshot` and `cancellation_policy_snapshot` are the selected terms the guest will be
 * charged under, copied onto the booking when it is created. `rate_options` keeps the alternatives
 * the provider returned so an admin can see what was offered without calling the provider again.
 */
export const offers = pgTable(
  "offers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: inventorySource("source").notNull().default("managed"),
    supplierId: text("supplier_id"),
    supplierOfferId: text("supplier_offer_id"),
    hotelId: uuid("hotel_id")
      .notNull()
      .references(() => hotels.id, { onDelete: "restrict" }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    checkIn: date("check_in", { mode: "date" }).notNull(),
    checkOut: date("check_out", { mode: "date" }).notNull(),
    adultCount: smallint("adult_count").notNull(),
    childCount: smallint("child_count").notNull().default(0),
    currencyCode: char("currency_code", { length: 3 })
      .notNull()
      .default("GBP")
      .references(() => currencies.code, { onDelete: "restrict" }),
    totalAmountMinor: integer("total_amount_minor").notNull(),
    priceSnapshot: jsonb("price_snapshot").notNull(),
    cancellationPolicySnapshot: jsonb("cancellation_policy_snapshot").notNull(),
    rateOptions: jsonb("rate_options")
      .notNull()
      .default(sql`'[]'::jsonb`),
    selectedRateOptionId: text("selected_rate_option_id").notNull(),
    /** Provider payload or version markers needed for support; never guest-facing. */
    metadata: jsonb("metadata")
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** After this instant the offer can no longer be booked. */
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    check("offers_stay_dates_check", sql`${table.checkOut} > ${table.checkIn}`),
    check("offers_adult_count_check", sql`${table.adultCount} between 1 and 50`),
    check("offers_child_count_check", sql`${table.childCount} between 0 and 50`),
    check("offers_total_amount_check", sql`${table.totalAmountMinor} >= 0`),
    check("offers_currency_code_check", sql`${table.currencyCode} ~ '^[A-Z]{3}$'`),
    check("offers_price_snapshot_check", sql`jsonb_typeof(${table.priceSnapshot}) = 'object'`),
    check(
      "offers_cancellation_policy_snapshot_check",
      sql`jsonb_typeof(${table.cancellationPolicySnapshot}) = 'object'`,
    ),
    check("offers_rate_options_check", sql`jsonb_typeof(${table.rateOptions}) = 'array'`),
    check(
      "offers_selected_rate_option_check",
      sql`length(${table.selectedRateOptionId}) between 1 and 100`,
    ),
    check("offers_metadata_check", sql`jsonb_typeof(${table.metadata}) = 'object'`),
    check("offers_expires_at_check", sql`${table.expiresAt} > ${table.createdAt}`),
    check(
      "offers_supplier_fields_check",
      sql`(
        (${table.source} = 'managed'
          and ${table.supplierId} is null
          and ${table.supplierOfferId} is null)
        or (${table.source} = 'supplier'
          and ${table.supplierId} is not null
          and ${table.supplierOfferId} is not null)
      )`,
    ),
    uniqueIndex("offers_supplier_reference_unique")
      .on(table.supplierId, table.supplierOfferId)
      .where(sql`${table.source} = 'supplier'`),
    index("offers_hotel_check_in_idx").on(table.hotelId, table.checkIn),
    index("offers_created_by_idx").on(table.createdByUserId),
    index("offers_expires_at_idx").on(table.expiresAt),
  ],
);

export type Offer = typeof offers.$inferSelect;
export type NewOffer = typeof offers.$inferInsert;
