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
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { bookings } from "./bookings.js";
import { currencies } from "./currencies.js";
import { paymentStatus } from "./enums.js";

/**
 * A provider payment attached to one booking. The unique `(provider, provider_payment_id)` pair
 * makes a replayed PaymentIntent fail at the database instead of creating a second booking.
 * Refunds and corrections are new rows that point at the original payment, so the charge row is
 * never rewritten.
 */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "restrict" }),
    provider: text("provider").notNull(),
    providerPaymentId: text("provider_payment_id").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currencyCode: char("currency_code", { length: 3 })
      .notNull()
      .references(() => currencies.code, { onDelete: "restrict" }),
    status: paymentStatus("status").notNull().default("pending"),
    originalPaymentId: uuid("original_payment_id").references((): AnyPgColumn => payments.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    check("payments_amount_check", sql`${table.amountMinor} >= 0`),
    check("payments_provider_check", sql`length(${table.provider}) > 0`),
    check("payments_provider_payment_id_check", sql`length(${table.providerPaymentId}) > 0`),
    check(
      "payments_original_payment_check",
      sql`${table.originalPaymentId} is null or ${table.originalPaymentId} <> ${table.id}`,
    ),
    uniqueIndex("payments_provider_payment_unique").on(table.provider, table.providerPaymentId),
    uniqueIndex("payments_active_booking_payment_unique")
      .on(table.bookingId)
      .where(
        sql`${table.originalPaymentId} is null and ${table.status} in ('pending', 'authorized', 'paid')`,
      ),
    index("payments_booking_created_at_idx").on(table.bookingId, table.createdAt),
    index("payments_status_created_at_idx").on(table.status, table.createdAt),
    index("payments_original_payment_idx").on(table.originalPaymentId),
  ],
);

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
