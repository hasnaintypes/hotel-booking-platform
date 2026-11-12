import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import {
  bookings,
  ledgerEntries,
  payments,
  type Booking,
  type Database,
  type LedgerEntry,
  type LedgerEntryType,
  type Payment,
  type PaymentStatus,
} from "@hotel-booking/db";
import { throwPostgresError } from "../../common/errors/postgres-errors";
import { isUuid } from "../../common/utils/uuid";
import { DATABASE } from "../postgres.database";

export type PaymentRecord = Payment;
export type BookingRecord = Booking;

export type ClaimKind = "create" | "capture" | "refund";

export type NewPaymentAttemptInput = {
  id?: string;
  bookingId: string;
  provider: string;
  idempotencyKey: string;
  amountMinor: number;
  currencyCode: string;
  captureMethod: "automatic" | "manual";
  originalPaymentId?: string;
  status?: PaymentStatus;
};

export type LedgerTotals = {
  chargedMinor: number;
  refundedMinor: number;
  feesMinor: number;
  adjustmentsMinor: number;
  netMinor: number;
};

export type NewLedgerEntryInput = {
  bookingId: string;
  paymentId?: string;
  entryType: LedgerEntryType;
  sourceKey: string;
  amountMinor: number;
  currencyCode: string;
  description?: string;
};

/**
 * Payment attempts, claim leases and the append-only ledger. The claim predicate is a single
 * conditional UPDATE, so two workers racing on the same capture or refund cannot both win.
 */
@Injectable()
export class PaymentsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findById(id: string): Promise<Payment | undefined> {
    if (!isUuid(id)) return undefined;
    const [row] = await this.db.select().from(payments).where(eq(payments.id, id)).limit(1);
    return row;
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<Payment | undefined> {
    const [row] = await this.db
      .select()
      .from(payments)
      .where(eq(payments.idempotencyKey, idempotencyKey))
      .limit(1);
    return row;
  }

  /** The original charge attempt for a booking; refund children are excluded. */
  async findCharge(bookingId: string): Promise<Payment | undefined> {
    if (!isUuid(bookingId)) return undefined;
    const [row] = await this.db
      .select()
      .from(payments)
      .where(and(eq(payments.bookingId, bookingId), isNull(payments.originalPaymentId)))
      .orderBy(desc(payments.createdAt), desc(payments.id))
      .limit(1);
    return row;
  }

  async listForBooking(bookingId: string): Promise<Payment[]> {
    if (!isUuid(bookingId)) return [];
    return this.db
      .select()
      .from(payments)
      .where(eq(payments.bookingId, bookingId))
      .orderBy(asc(payments.createdAt), asc(payments.id));
  }

  async listForBookings(bookingIds: string[]): Promise<Payment[]> {
    const ids = [...new Set(bookingIds.filter(isUuid))];
    if (ids.length === 0) return [];
    return this.db
      .select()
      .from(payments)
      .where(inArray(payments.bookingId, ids))
      .orderBy(asc(payments.createdAt), asc(payments.id));
  }

  async findByProviderPaymentId(
    provider: string,
    providerPaymentId: string,
  ): Promise<Payment | undefined> {
    const [row] = await this.db
      .select()
      .from(payments)
      .where(
        and(eq(payments.provider, provider), eq(payments.providerPaymentId, providerPaymentId)),
      )
      .limit(1);
    return row;
  }

  /** Original (non-refund) attempts created in the reconciliation window. */
  async listOriginalSince(since: Date, limit = 200): Promise<Payment[]> {
    return this.db
      .select()
      .from(payments)
      .where(
        and(
          isNull(payments.originalPaymentId),
          eq(payments.provider, "stripe"),
          gte(payments.createdAt, since),
        ),
      )
      .orderBy(asc(payments.createdAt), asc(payments.id))
      .limit(Math.min(Math.max(limit, 1), 1_000));
  }

  /** Refund child rows created in the reconciliation window. */
  async listRefundsSince(since: Date, limit = 200): Promise<Payment[]> {
    return this.db
      .select()
      .from(payments)
      .where(
        and(
          isNotNull(payments.originalPaymentId),
          eq(payments.provider, "stripe"),
          gte(payments.createdAt, since),
        ),
      )
      .orderBy(asc(payments.createdAt), asc(payments.id))
      .limit(Math.min(Math.max(limit, 1), 1_000));
  }

  async findBooking(bookingId: string): Promise<Booking | undefined> {
    if (!isUuid(bookingId)) return undefined;
    const [row] = await this.db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
    return row;
  }

  async insertAttempt(input: NewPaymentAttemptInput): Promise<Payment> {
    try {
      const [row] = await this.db
        .insert(payments)
        .values({
          ...(input.id ? { id: input.id } : {}),
          bookingId: input.bookingId,
          provider: input.provider,
          idempotencyKey: input.idempotencyKey,
          amountMinor: input.amountMinor,
          currencyCode: input.currencyCode,
          captureMethod: input.captureMethod,
          status: input.status ?? "pending",
          originalPaymentId: input.originalPaymentId ?? null,
        })
        .returning();
      return row;
    } catch (error) {
      return throwPostgresError(error);
    }
  }

  /**
   * Atomically takes a lease on an attempt. Expired leases are reclaimable, which lets a crashed
   * worker be recovered without a separate sweeper.
   */
  async claim(
    paymentId: string,
    kind: ClaimKind,
    token: string,
    leaseMs: number,
  ): Promise<Payment | undefined> {
    if (!isUuid(paymentId)) return undefined;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + leaseMs);

    const claimable =
      kind === "create"
        ? sql`${payments.status} in ('pending', 'failed') and ${payments.providerPaymentId} is null`
        : kind === "capture"
          ? sql`${payments.status} = 'authorized'`
          : sql`${payments.status} = 'paid'`;

    const [row] = await this.db
      .update(payments)
      .set({
        claimToken: token,
        claimKind: kind,
        claimExpiresAt: expiresAt,
        failureCode: null,
        failureMessage: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(payments.id, paymentId),
          or(isNull(payments.claimToken), lte(payments.claimExpiresAt, now)),
          claimable,
        ),
      )
      .returning();
    return row;
  }

  async settleIntent(
    paymentId: string,
    token: string,
    input: { providerPaymentId: string; status: PaymentStatus; capturedAmountMinor?: number },
  ): Promise<Payment | undefined> {
    const [row] = await this.db
      .update(payments)
      .set({
        providerPaymentId: input.providerPaymentId,
        status: input.status,
        capturedAmountMinor: input.capturedAmountMinor ?? null,
        claimToken: null,
        claimKind: null,
        claimExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(payments.id, paymentId), eq(payments.claimToken, token)))
      .returning();
    return row;
  }

  async settleCapture(
    paymentId: string,
    token: string,
    capturedAmountMinor: number,
  ): Promise<Payment | undefined> {
    const [row] = await this.db
      .update(payments)
      .set({
        status: "paid",
        capturedAmountMinor,
        claimToken: null,
        claimKind: null,
        claimExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(payments.id, paymentId), eq(payments.claimToken, token)))
      .returning();
    return row;
  }

  async settleRefund(
    refundPaymentId: string,
    providerPaymentId: string,
  ): Promise<Payment | undefined> {
    const [row] = await this.db
      .update(payments)
      .set({
        providerPaymentId,
        status: "refunded",
        capturedAmountMinor: null,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, refundPaymentId))
      .returning();
    return row;
  }

  /**
   * Applies a provider-read state without a claim. Used when a webhook was lost and the
   * reconciler is repairing local state from Stripe. `fromStatuses` keeps a late read from
   * moving a payment backwards.
   */
  async applyProviderState(
    paymentId: string,
    input: {
      status: PaymentStatus;
      fromStatuses: PaymentStatus[];
      providerPaymentId?: string;
      capturedAmountMinor?: number | null;
      failureCode?: string | null;
      failureMessage?: string | null;
    },
  ): Promise<Payment | undefined> {
    if (!isUuid(paymentId) || input.fromStatuses.length === 0) return undefined;
    const [row] = await this.db
      .update(payments)
      .set({
        status: input.status,
        ...(input.providerPaymentId ? { providerPaymentId: input.providerPaymentId } : {}),
        ...(input.capturedAmountMinor !== undefined
          ? { capturedAmountMinor: input.capturedAmountMinor }
          : {}),
        ...(input.failureCode !== undefined ? { failureCode: input.failureCode } : {}),
        ...(input.failureMessage !== undefined ? { failureMessage: input.failureMessage } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(payments.id, paymentId), inArray(payments.status, input.fromStatuses)))
      .returning();
    return row;
  }

  async markFailed(
    paymentId: string,
    failure: { code?: string; message?: string; status?: PaymentStatus },
  ): Promise<Payment | undefined> {
    const [row] = await this.db
      .update(payments)
      .set({
        status: failure.status ?? "failed",
        failureCode: failure.code ?? null,
        failureMessage: failure.message ?? null,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, paymentId))
      .returning();
    return row;
  }

  async releaseClaim(
    paymentId: string,
    token: string,
    failure?: { status?: PaymentStatus; code?: string; message?: string },
  ): Promise<Payment | undefined> {
    const [row] = await this.db
      .update(payments)
      .set({
        claimToken: null,
        claimKind: null,
        claimExpiresAt: null,
        ...(failure?.status ? { status: failure.status } : {}),
        failureCode: failure?.code ?? null,
        failureMessage: failure?.message ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(payments.id, paymentId), eq(payments.claimToken, token)))
      .returning();
    return row;
  }

  async recordLedgerEntry(input: NewLedgerEntryInput): Promise<LedgerEntry | undefined> {
    const [row] = await this.db
      .insert(ledgerEntries)
      .values({
        bookingId: input.bookingId,
        paymentId: input.paymentId ?? null,
        entryType: input.entryType,
        sourceKey: input.sourceKey,
        amountMinor: input.amountMinor,
        currencyCode: input.currencyCode,
        description: input.description ?? null,
      })
      .onConflictDoNothing()
      .returning();
    return row;
  }

  async listLedger(bookingId: string): Promise<LedgerEntry[]> {
    if (!isUuid(bookingId)) return [];
    return this.db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.bookingId, bookingId))
      .orderBy(asc(ledgerEntries.occurredAt), asc(ledgerEntries.id));
  }

  /** Signed projection of the non-negative ledger rows. */
  async ledgerTotals(bookingId: string): Promise<LedgerTotals> {
    const empty = {
      chargedMinor: 0,
      refundedMinor: 0,
      feesMinor: 0,
      adjustmentsMinor: 0,
      netMinor: 0,
    };
    if (!isUuid(bookingId)) return empty;

    const [row] = await this.db
      .select({
        chargedMinor: sql<number>`coalesce(sum(${ledgerEntries.amountMinor}) filter (where ${ledgerEntries.entryType} = 'charge'), 0)::int`,
        refundedMinor: sql<number>`coalesce(sum(${ledgerEntries.amountMinor}) filter (where ${ledgerEntries.entryType} = 'refund'), 0)::int`,
        feesMinor: sql<number>`coalesce(sum(${ledgerEntries.amountMinor}) filter (where ${ledgerEntries.entryType} = 'fee'), 0)::int`,
        adjustmentsMinor: sql<number>`coalesce(sum(${ledgerEntries.amountMinor}) filter (where ${ledgerEntries.entryType} = 'adjustment'), 0)::int`,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.bookingId, bookingId));

    if (!row) return empty;
    const chargedMinor = Number(row.chargedMinor);
    const refundedMinor = Number(row.refundedMinor);
    const feesMinor = Number(row.feesMinor);
    const adjustmentsMinor = Number(row.adjustmentsMinor);
    return {
      chargedMinor,
      refundedMinor,
      feesMinor,
      adjustmentsMinor,
      netMinor: chargedMinor - refundedMinor - feesMinor + adjustmentsMinor,
    };
  }
}
