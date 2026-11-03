import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  index,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { currencies } from "./currencies.js";
import { hotelSource, hotelStatus } from "./enums.js";
import { organisations } from "./organisations.js";
import { users } from "./users.js";

/**
 * Canonical hotel record shared by owner-managed and supplier-derived inventory. A managed
 * hotel is owned directly by a user, by an organisation, or both; `created_by_user_id` records
 * the user who created the row even when the owning organisation later changes.
 */
export const hotels = pgTable(
  "hotels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: hotelSource("source").notNull().default("managed"),
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "restrict" }),
    organisationId: uuid("organisation_id").references(() => organisations.id, {
      onDelete: "restrict",
    }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    name: text("name").notNull(),
    description: text("description").notNull(),
    city: text("city").notNull(),
    country: text("country").notNull(),
    countryCode: char("country_code", { length: 2 }).notNull(),
    addressLine1: text("address_line1"),
    addressLine2: text("address_line2"),
    state: text("state"),
    postalCode: text("postal_code"),
    latitude: numeric("latitude", { precision: 9, scale: 6 }),
    longitude: numeric("longitude", { precision: 9, scale: 6 }),
    starRating: smallint("star_rating").notNull(),
    pricePerNightMinor: integer("price_per_night_minor").notNull(),
    currencyCode: char("currency_code", { length: 3 })
      .notNull()
      .default("GBP")
      .references(() => currencies.code, { onDelete: "restrict" }),
    status: hotelStatus("status").notNull().default("draft"),
    isFeatured: boolean("is_featured").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    check("hotels_star_rating_check", sql`${table.starRating} between 1 and 5`),
    check("hotels_price_check", sql`${table.pricePerNightMinor} >= 0`),
    check("hotels_country_code_check", sql`${table.countryCode} ~ '^[A-Z]{2}$'`),
    check("hotels_currency_code_check", sql`${table.currencyCode} ~ '^[A-Z]{3}$'`),
    check(
      "hotels_latitude_check",
      sql`${table.latitude} is null or ${table.latitude} between -90 and 90`,
    ),
    check(
      "hotels_longitude_check",
      sql`${table.longitude} is null or ${table.longitude} between -180 and 180`,
    ),
    check(
      "hotels_managed_owner_check",
      sql`${table.source} <> 'managed' or ${table.ownerUserId} is not null or ${table.organisationId} is not null`,
    ),
    check(
      "hotels_managed_creator_check",
      sql`${table.source} <> 'managed' or ${table.createdByUserId} is not null`,
    ),
    index("hotels_city_trgm_idx").using("gin", sql`lower(${table.city}) gin_trgm_ops`),
    index("hotels_country_trgm_idx").using("gin", sql`lower(${table.country}) gin_trgm_ops`),
    index("hotels_country_code_idx").on(table.countryCode),
    index("hotels_price_idx").on(table.pricePerNightMinor),
    index("hotels_star_rating_idx").on(table.starRating),
    index("hotels_owner_idx").on(table.ownerUserId),
    index("hotels_organisation_idx").on(table.organisationId),
    index("hotels_created_by_idx").on(table.createdByUserId),
    index("hotels_status_idx").on(table.status),
    index("hotels_city_star_rating_idx").on(table.city, table.starRating),
  ],
);

export type Hotel = typeof hotels.$inferSelect;
export type NewHotel = typeof hotels.$inferInsert;
