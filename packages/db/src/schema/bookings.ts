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
import { bookingStatus, inventorySource } from "./enums.js";
import { hotels } from "./hotels.js";
import { organisations } from "./organisations.js";
import { users } from "./users.js";

/**
 * A stay, owned directly by a user or by an organisation (agency-ready). `owner_user_id` is the
 * guest the booking belongs to; `organisation_id` marks an agency booking and
 * `created_by_user_id` records the member who created it.
 *
 * Money is stored as integer minor units with an explicit currency. `price_snapshot` freezes the
 * server-computed quote (net, markup, taxes, FX and rounding) so later pricing changes cannot
 * rewrite what the guest agreed to. `public_reference` is a high-entropy bearer reference for
 * guest-facing lookups; it is not the primary key.
 */
export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicReference: text("public_reference")
      .notNull()
      .default(sql`lower(replace(gen_random_uuid()::text, '-', ''))`),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    organisationId: uuid("organisation_id").references(() => organisations.id, {
      onDelete: "restrict",
    }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    hotelId: uuid("hotel_id")
      .notNull()
      .references(() => hotels.id, { onDelete: "restrict" }),
    inventorySource: inventorySource("inventory_source").notNull().default("managed"),
    supplierId: text("supplier_id"),
    supplierReference: text("supplier_reference"),
    guestFirstName: text("guest_first_name"),
    guestLastName: text("guest_last_name"),
    guestEmail: text("guest_email"),
    guestPhone: text("guest_phone"),
    adultCount: smallint("adult_count").notNull().default(1),
    childCount: smallint("child_count").notNull().default(0),
    checkIn: date("check_in", { mode: "date" }).notNull(),
    checkOut: date("check_out", { mode: "date" }).notNull(),
    status: bookingStatus("status").notNull().default("pending_payment"),
    version: integer("version").notNull().default(0),
    totalAmountMinor: integer("total_amount_minor").notNull().default(0),
    currencyCode: char("currency_code", { length: 3 })
      .notNull()
      .default("GBP")
      .references(() => currencies.code, { onDelete: "restrict" }),
    priceSnapshot: jsonb("price_snapshot")
      .notNull()
      .default(sql`'{}'::jsonb`),
    cancellationPolicySnapshot: jsonb("cancellation_policy_snapshot"),
    specialRequests: text("special_requests"),
    cancellationReason: text("cancellation_reason"),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    check("bookings_stay_dates_check", sql`${table.checkOut} > ${table.checkIn}`),
    check("bookings_version_check", sql`${table.version} >= 0`),
    check("bookings_adult_count_check", sql`${table.adultCount} between 1 and 50`),
    check("bookings_child_count_check", sql`${table.childCount} between 0 and 50`),
    check("bookings_total_amount_check", sql`${table.totalAmountMinor} >= 0`),
    check("bookings_public_reference_check", sql`${table.publicReference} ~ '^[a-z0-9]{16,64}$'`),
    check(
      "bookings_idempotency_key_check",
      sql`${table.idempotencyKey} is null or length(${table.idempotencyKey}) between 1 and 255`,
    ),
    check(
      "bookings_supplier_fields_check",
      sql`(
        (${table.inventorySource} = 'managed'
          and ${table.supplierId} is null
          and ${table.supplierReference} is null)
        or (${table.inventorySource} = 'supplier'
          and ${table.supplierId} is not null
          and ${table.supplierReference} is not null)
      )`,
    ),
    check("bookings_price_snapshot_check", sql`jsonb_typeof(${table.priceSnapshot}) = 'object'`),
    check(
      "bookings_cancellation_policy_snapshot_check",
      sql`${table.cancellationPolicySnapshot} is null
        or jsonb_typeof(${table.cancellationPolicySnapshot}) = 'object'`,
    ),
    uniqueIndex("bookings_public_reference_unique").on(table.publicReference),
    uniqueIndex("bookings_owner_idempotency_unique")
      .on(table.ownerUserId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null and ${table.organisationId} is null`),
    uniqueIndex("bookings_organisation_idempotency_unique")
      .on(table.organisationId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null and ${table.organisationId} is not null`),
    index("bookings_owner_created_at_idx").on(table.ownerUserId, table.createdAt),
    index("bookings_created_at_idx").on(table.createdAt),
    index("bookings_hotel_check_in_idx").on(table.hotelId, table.checkIn),
    index("bookings_status_created_at_idx").on(table.status, table.createdAt),
    index("bookings_organisation_created_at_idx").on(table.organisationId, table.createdAt),
    index("bookings_created_by_idx").on(table.createdByUserId),
  ],
);

export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;
