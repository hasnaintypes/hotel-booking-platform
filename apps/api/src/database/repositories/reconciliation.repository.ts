import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import {
  ledgerEntries,
  payments,
  reconciliationDiscrepancies,
  type Database,
  type ReconciliationDiscrepancy,
} from "@hotel-booking/db";
import { DATABASE } from "../postgres.database";

export const DISCREPANCY_KINDS = [
  "payment_status_mismatch",
  "payment_amount_mismatch",
  "refund_mismatch",
  "local_without_provider",
  "provider_missing",
  "provider_without_local",
  "ledger_mismatch",
] as const;

export type DiscrepancyKind = (typeof DISCREPANCY_KINDS)[number];

export const DISCREPANCY_STATUSES = ["open", "resolved", "ignored"] as const;

export type DiscrepancyStatus = (typeof DISCREPANCY_STATUSES)[number];

export type DiscrepancyListFilters = {
  status?: DiscrepancyStatus;
  kind?: DiscrepancyKind;
  assignedToUserId?: string;
  limit?: number;
  offset?: number;
};

export type NewDiscrepancyInput = {
  dedupeKey: string;
  kind: DiscrepancyKind;
  provider?: string;
  bookingId?: string;
  paymentId?: string;
  providerReference?: string;
  details: Record<string, unknown>;
};

export type BookingLedgerTotals = {
  bookingId: string;
  chargedMinor: number;
  refundedMinor: number;
  feesMinor: number;
  adjustmentsMinor: number;
};

export type BookingPaymentTotals = {
  bookingId: string;
  chargedMinor: number;
  refundedMinor: number;
};

/**
 * Reconciliation findings and the aggregate reads the detectors compare. A finding is stored once
 * while open (`dedupe_key` partial unique index), so a job that runs every fifteen minutes does not
 * flood the table with the same mismatch.
 */
@Injectable()
export class ReconciliationRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async record(input: NewDiscrepancyInput): Promise<ReconciliationDiscrepancy | undefined> {
    const [row] = await this.db
      .insert(reconciliationDiscrepancies)
      .values({
        dedupeKey: input.dedupeKey,
        kind: input.kind,
        provider: input.provider ?? "stripe",
        bookingId: input.bookingId ?? null,
        paymentId: input.paymentId ?? null,
        providerReference: input.providerReference ?? null,
        details: input.details,
      })
      .onConflictDoNothing()
      .returning();
    return row;
  }

  async listOpen(limit = 200): Promise<ReconciliationDiscrepancy[]> {
    return this.db
      .select()
      .from(reconciliationDiscrepancies)
      .where(eq(reconciliationDiscrepancies.status, "open"))
      .orderBy(asc(reconciliationDiscrepancies.detectedAt), asc(reconciliationDiscrepancies.id))
      .limit(Math.min(Math.max(limit, 1), 1_000));
  }

  async countOpenByKind(): Promise<Record<string, number>> {
    const rows = await this.db
      .select({
        kind: reconciliationDiscrepancies.kind,
        total: sql<number>`count(*)::int`,
      })
      .from(reconciliationDiscrepancies)
      .where(eq(reconciliationDiscrepancies.status, "open"))
      .groupBy(reconciliationDiscrepancies.kind);

    return Object.fromEntries(rows.map((row) => [row.kind, Number(row.total)]));
  }

  async resolve(id: string, resolution: string): Promise<ReconciliationDiscrepancy | undefined> {
    return this.close(id, { status: "resolved", resolution });
  }

  /**
   * Lists findings for the admin queue. Open findings sort oldest first so the longest-waiting
   * discrepancy is triaged first; closed history sorts newest first.
   */
  async listForAdmin(filters: DiscrepancyListFilters = {}): Promise<ReconciliationDiscrepancy[]> {
    const conditions = [];
    if (filters.status) {
      conditions.push(eq(reconciliationDiscrepancies.status, filters.status));
    }
    if (filters.kind) {
      conditions.push(eq(reconciliationDiscrepancies.kind, filters.kind));
    }
    if (filters.assignedToUserId) {
      conditions.push(eq(reconciliationDiscrepancies.assignedToUserId, filters.assignedToUserId));
    }

    const limit = Math.min(Math.max(filters.limit ?? 200, 1), 500);
    const offset = Math.max(filters.offset ?? 0, 0);
    const oldestFirst = !filters.status || filters.status === "open";

    return this.db
      .select()
      .from(reconciliationDiscrepancies)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(
        oldestFirst
          ? asc(reconciliationDiscrepancies.detectedAt)
          : desc(reconciliationDiscrepancies.detectedAt),
        oldestFirst ? asc(reconciliationDiscrepancies.id) : desc(reconciliationDiscrepancies.id),
      )
      .limit(limit)
      .offset(offset);
  }

  /** Loads one finding; the admin API uses it to reject updates to an already-closed row. */
  async findById(id: string): Promise<ReconciliationDiscrepancy | undefined> {
    const [row] = await this.db
      .select()
      .from(reconciliationDiscrepancies)
      .where(eq(reconciliationDiscrepancies.id, id))
      .limit(1);
    return row;
  }

  /** Assigns an open finding to an operator, or clears the assignment when given `null`. */
  async assign(
    id: string,
    assignedToUserId: string | null,
    assignedByUserId: string,
  ): Promise<ReconciliationDiscrepancy | undefined> {
    const [row] = await this.db
      .update(reconciliationDiscrepancies)
      .set({
        assignedToUserId,
        assignedAt: assignedToUserId ? new Date() : null,
        assignedByUserId: assignedToUserId ? assignedByUserId : null,
        updatedAt: new Date(),
      })
      .where(
        and(eq(reconciliationDiscrepancies.id, id), eq(reconciliationDiscrepancies.status, "open")),
      )
      .returning();
    return row;
  }

  /** Closes an open finding as resolved or ignored, recording who did it and why. */
  async close(
    id: string,
    input: {
      status: "resolved" | "ignored";
      resolution: string;
      resolvedByUserId?: string;
    },
  ): Promise<ReconciliationDiscrepancy | undefined> {
    const [row] = await this.db
      .update(reconciliationDiscrepancies)
      .set({
        status: input.status,
        resolution: input.resolution,
        resolvedByUserId: input.resolvedByUserId ?? null,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(eq(reconciliationDiscrepancies.id, id), eq(reconciliationDiscrepancies.status, "open")),
      )
      .returning();
    return row;
  }

  /** Signed ledger totals per booking for rows touched in the audit window. */
  async ledgerTotalsSince(since: Date, limit = 1_000): Promise<BookingLedgerTotals[]> {
    const rows = await this.db
      .select({
        bookingId: ledgerEntries.bookingId,
        chargedMinor: sql<number>`coalesce(sum(${ledgerEntries.amountMinor}) filter (where ${ledgerEntries.entryType} = 'charge'), 0)::int`,
        refundedMinor: sql<number>`coalesce(sum(${ledgerEntries.amountMinor}) filter (where ${ledgerEntries.entryType} = 'refund'), 0)::int`,
        feesMinor: sql<number>`coalesce(sum(${ledgerEntries.amountMinor}) filter (where ${ledgerEntries.entryType} = 'fee'), 0)::int`,
        adjustmentsMinor: sql<number>`coalesce(sum(${ledgerEntries.amountMinor}) filter (where ${ledgerEntries.entryType} = 'adjustment'), 0)::int`,
      })
      .from(ledgerEntries)
      .where(gte(ledgerEntries.occurredAt, since))
      .groupBy(ledgerEntries.bookingId)
      .orderBy(asc(ledgerEntries.bookingId))
      .limit(Math.min(Math.max(limit, 1), 10_000));

    return rows.map((row) => ({
      bookingId: row.bookingId,
      chargedMinor: Number(row.chargedMinor),
      refundedMinor: Number(row.refundedMinor),
      feesMinor: Number(row.feesMinor),
      adjustmentsMinor: Number(row.adjustmentsMinor),
    }));
  }

  /** What the ledger should show, derived from the payment rows themselves. */
  async paymentTotalsSince(since: Date, limit = 1_000): Promise<BookingPaymentTotals[]> {
    const rows = await this.db
      .select({
        bookingId: payments.bookingId,
        chargedMinor: sql<number>`coalesce(sum(case
          when ${payments.originalPaymentId} is null and ${payments.status} = 'paid'
            then coalesce(${payments.capturedAmountMinor}, ${payments.amountMinor})
          else 0 end), 0)::int`,
        refundedMinor: sql<number>`coalesce(sum(case
          when ${payments.originalPaymentId} is not null and ${payments.status} = 'refunded'
            then ${payments.amountMinor}
          else 0 end), 0)::int`,
      })
      .from(payments)
      .where(gte(payments.createdAt, since))
      .groupBy(payments.bookingId)
      .orderBy(asc(payments.bookingId))
      .limit(Math.min(Math.max(limit, 1), 10_000));

    return rows.map((row) => ({
      bookingId: row.bookingId,
      chargedMinor: Number(row.chargedMinor),
      refundedMinor: Number(row.refundedMinor),
    }));
  }

  /** Exact ledger totals for a bounded set of bookings, regardless of when rows were written. */
  async ledgerTotalsForBookings(bookingIds: string[]): Promise<BookingLedgerTotals[]> {
    const ids = [...new Set(bookingIds)];
    if (ids.length === 0) return [];
    const rows = await this.db
      .select({
        bookingId: ledgerEntries.bookingId,
        chargedMinor: sql<number>`coalesce(sum(${ledgerEntries.amountMinor}) filter (where ${ledgerEntries.entryType} = 'charge'), 0)::int`,
        refundedMinor: sql<number>`coalesce(sum(${ledgerEntries.amountMinor}) filter (where ${ledgerEntries.entryType} = 'refund'), 0)::int`,
        feesMinor: sql<number>`coalesce(sum(${ledgerEntries.amountMinor}) filter (where ${ledgerEntries.entryType} = 'fee'), 0)::int`,
        adjustmentsMinor: sql<number>`coalesce(sum(${ledgerEntries.amountMinor}) filter (where ${ledgerEntries.entryType} = 'adjustment'), 0)::int`,
      })
      .from(ledgerEntries)
      .where(inArray(ledgerEntries.bookingId, ids))
      .groupBy(ledgerEntries.bookingId);

    return rows.map((row) => ({
      bookingId: row.bookingId,
      chargedMinor: Number(row.chargedMinor),
      refundedMinor: Number(row.refundedMinor),
      feesMinor: Number(row.feesMinor),
      adjustmentsMinor: Number(row.adjustmentsMinor),
    }));
  }

  /** Exact payment-derived totals for a bounded set of bookings. */
  async paymentTotalsForBookings(bookingIds: string[]): Promise<BookingPaymentTotals[]> {
    const ids = [...new Set(bookingIds)];
    if (ids.length === 0) return [];
    const rows = await this.db
      .select({
        bookingId: payments.bookingId,
        chargedMinor: sql<number>`coalesce(sum(case
          when ${payments.originalPaymentId} is null and ${payments.status} = 'paid'
            then coalesce(${payments.capturedAmountMinor}, ${payments.amountMinor})
          else 0 end), 0)::int`,
        refundedMinor: sql<number>`coalesce(sum(case
          when ${payments.originalPaymentId} is not null and ${payments.status} = 'refunded'
            then ${payments.amountMinor}
          else 0 end), 0)::int`,
      })
      .from(payments)
      .where(inArray(payments.bookingId, ids))
      .groupBy(payments.bookingId);

    return rows.map((row) => ({
      bookingId: row.bookingId,
      chargedMinor: Number(row.chargedMinor),
      refundedMinor: Number(row.refundedMinor),
    }));
  }

  /** Recent findings for an admin view; newest first. */
  async listRecent(limit = 200): Promise<ReconciliationDiscrepancy[]> {
    return this.db
      .select()
      .from(reconciliationDiscrepancies)
      .orderBy(desc(reconciliationDiscrepancies.detectedAt), desc(reconciliationDiscrepancies.id))
      .limit(Math.min(Math.max(limit, 1), 1_000));
  }
}
