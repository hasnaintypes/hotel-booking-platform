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
import { bookings } from "./bookings.js";
import { payments } from "./payments.js";
import { users } from "./users.js";

/**
 * One detected difference between our records and a payment provider. Rows are append-only in
 * spirit: an operator resolves or ignores a finding, and a repeat detection while it is still open
 * is deduplicated by `dedupe_key` instead of creating noise.
 *
 * `details` keeps the compared values (local and provider state) so an admin can triage without
 * replaying the provider call.
 */
export const reconciliationDiscrepancies = pgTable(
  "reconciliation_discrepancies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Stable per finding, e.g. `payment_status_mismatch:<payment id>`. */
    dedupeKey: text("dedupe_key").notNull(),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("open"),
    provider: text("provider").notNull().default("stripe"),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "restrict" }),
    paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "restrict" }),
    providerReference: text("provider_reference"),
    details: jsonb("details")
      .notNull()
      .default(sql`'{}'::jsonb`),
    detectedAt: timestamp("detected_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
    resolution: text("resolution"),
    /** Operator currently owning the follow-up while the finding stays open. */
    assignedToUserId: uuid("assigned_to_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    assignedAt: timestamp("assigned_at", { withTimezone: true, mode: "date" }),
    assignedByUserId: uuid("assigned_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Who resolved or ignored the finding; kept for the audit trail after the row closes. */
    resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    check("reconciliation_discrepancies_dedupe_key_check", sql`length(${table.dedupeKey}) > 0`),
    check(
      "reconciliation_discrepancies_kind_check",
      sql`${table.kind} in (
        'payment_status_mismatch',
        'payment_amount_mismatch',
        'refund_mismatch',
        'local_without_provider',
        'provider_missing',
        'provider_without_local',
        'ledger_mismatch'
      )`,
    ),
    check(
      "reconciliation_discrepancies_status_check",
      sql`${table.status} in ('open', 'resolved', 'ignored')`,
    ),
    check("reconciliation_discrepancies_provider_check", sql`length(${table.provider}) > 0`),
    check(
      "reconciliation_discrepancies_provider_reference_check",
      sql`${table.providerReference} is null or length(${table.providerReference}) > 0`,
    ),
    check(
      "reconciliation_discrepancies_details_check",
      sql`jsonb_typeof(${table.details}) = 'object'`,
    ),
    uniqueIndex("reconciliation_discrepancies_open_dedupe_unique")
      .on(table.dedupeKey)
      .where(sql`${table.status} = 'open'`),
    index("reconciliation_discrepancies_status_detected_at_idx").on(table.status, table.detectedAt),
    index("reconciliation_discrepancies_assigned_idx").on(table.assignedToUserId, table.status),
    index("reconciliation_discrepancies_booking_idx").on(table.bookingId),
    index("reconciliation_discrepancies_payment_idx").on(table.paymentId),
  ],
);

export type ReconciliationDiscrepancy = typeof reconciliationDiscrepancies.$inferSelect;
export type NewReconciliationDiscrepancy = typeof reconciliationDiscrepancies.$inferInsert;
