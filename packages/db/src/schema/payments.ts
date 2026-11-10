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
 * A provider payment attempt attached to one booking. The unique `(provider, provider_payment_id)`
 * pair makes a replayed PaymentIntent fail at the database instead of creating a second booking.
 * Refunds and corrections are new rows that point at the original payment, so the charge row is
 * never rewritten. `claim_*` columns implement claim-call-settle: one worker owns an attempt while
 * the provider call is outside the transaction, and the lease lets a crashed worker be recovered.
 */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "restrict" }),
    provider: text("provider").notNull(),
    providerPaymentId: text("provider_payment_id"),
    idempotencyKey: text("idempotency_key"),
    amountMinor: integer("amount_minor").notNull(),
    capturedAmountMinor: integer("captured_amount_minor"),
    currencyCode: char("currency_code", { length: 3 })
      .notNull()
      .references(() => currencies.code, { onDelete: "restrict" }),
    status: paymentStatus("status").notNull().default("pending"),
    captureMethod: text("capture_method").notNull().default("automatic"),
    originalPaymentId: uuid("original_payment_id").references((): AnyPgColumn => payments.id, {
      onDelete: "restrict",
    }),
    claimToken: uuid("claim_token"),
    claimKind: text("claim_kind"),
    claimExpiresAt: timestamp("claim_expires_at", { withTimezone: true, mode: "date" }),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    check("payments_amount_check", sql`${table.amountMinor} >= 0`),
    check("payments_provider_check", sql`length(${table.provider}) > 0`),
    check(
      "payments_provider_payment_id_check",
      sql`${table.providerPaymentId} is null or length(${table.providerPaymentId}) > 0`,
    ),
    check(
      "payments_idempotency_key_check",
      sql`${table.idempotencyKey} is null or length(${table.idempotencyKey}) between 1 and 255`,
    ),
    check("payments_capture_method_check", sql`${table.captureMethod} in ('automatic', 'manual')`),
    check(
      "payments_captured_amount_check",
      sql`${table.capturedAmountMinor} is null
        or (${table.capturedAmountMinor} >= 0 and ${table.capturedAmountMinor} <= ${table.amountMinor})`,
    ),
    check(
      "payments_claim_check",
      sql`(
        (${table.claimToken} is null
          and ${table.claimKind} is null
          and ${table.claimExpiresAt} is null)
        or (${table.claimToken} is not null
          and ${table.claimKind} in ('create', 'capture', 'refund')
          and ${table.claimExpiresAt} is not null)
      )`,
    ),
    check(
      "payments_original_payment_check",
      sql`${table.originalPaymentId} is null or ${table.originalPaymentId} <> ${table.id}`,
    ),
    uniqueIndex("payments_provider_payment_unique")
      .on(table.provider, table.providerPaymentId)
      .where(sql`${table.providerPaymentId} is not null`),
    uniqueIndex("payments_idempotency_key_unique")
      .on(table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    uniqueIndex("payments_active_booking_payment_unique")
      .on(table.bookingId)
      .where(
        sql`${table.originalPaymentId} is null and ${table.status} in ('pending', 'authorized', 'paid')`,
      ),
    index("payments_booking_created_at_idx").on(table.bookingId, table.createdAt),
    index("payments_status_created_at_idx").on(table.status, table.createdAt),
    index("payments_original_payment_idx").on(table.originalPaymentId),
    index("payments_claim_expires_at_idx").on(table.claimExpiresAt),
  ],
);

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
