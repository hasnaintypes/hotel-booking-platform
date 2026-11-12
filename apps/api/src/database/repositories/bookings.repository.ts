import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import {
  bookingEvents,
  bookings,
  payments,
  withTransaction,
  type Booking,
  type Database,
  type Payment,
  type Transaction,
} from "@hotel-booking/db";
import { throwPostgresError } from "../../common/errors/postgres-errors";
import { withRequestTransaction, runInRequestTransaction } from "../request-transaction";
import { isUuid } from "../../common/utils/uuid";
import {
  assertBookingTransition,
  BookingTransitionConflictError,
  type BookingTransitionInput,
} from "../../domain/bookings/booking-state-machine";
import { DATABASE } from "../postgres.database";

export type BookingWithPayments = {
  booking: Booking;
  payments: Payment[];
};

export type NewPendingBookingInput = {
  ownerUserId: string;
  createdByUserId: string;
  hotelId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  adultCount: number;
  childCount: number;
  checkIn: Date;
  checkOut: Date;
  totalAmountMinor: number;
  currencyCode: string;
  priceSnapshot: Record<string, unknown>;
  cancellationPolicySnapshot: Record<string, unknown>;
  idempotencyKey: string;
  specialRequests?: string;
  requestId?: string;
};

export type HotelBookingStats = {
  totalBookings: number;
  totalRevenue: number;
};

export type UserBookingStats = {
  totalBookings: number;
  totalSpent: number;
};

export type OwnerBookingCounts = {
  upcomingBookings: number;
  completedBookings: number;
  cancelledBookings: number;
};

/** Default bound for list endpoints; callers cannot load an unbounded table scan. */
export const BOOKING_LIST_LIMIT = 200;

/**
 * Booking aggregate storage. Every write that changes state also records an append-only
 * booking event, and payment state lives in `payments` rather than on the booking row.
 */
@Injectable()
export class BookingsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findById(id: string): Promise<BookingWithPayments | undefined> {
    if (!isUuid(id)) return undefined;
    const [row] = await this.db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
    if (!row) return undefined;
    const [record] = await this.withPayments([row]);
    return record;
  }

  async listByOwner(
    ownerUserId: string,
    limit = BOOKING_LIST_LIMIT,
  ): Promise<BookingWithPayments[]> {
    if (!isUuid(ownerUserId)) return [];
    const rows = await this.db
      .select()
      .from(bookings)
      .where(eq(bookings.ownerUserId, ownerUserId))
      .orderBy(desc(bookings.createdAt), desc(bookings.id))
      .limit(Math.min(limit, BOOKING_LIST_LIMIT));
    return this.withPayments(rows);
  }

  async listAll(limit = BOOKING_LIST_LIMIT): Promise<BookingWithPayments[]> {
    const rows = await this.db
      .select()
      .from(bookings)
      .orderBy(desc(bookings.createdAt), desc(bookings.id))
      .limit(Math.min(limit, BOOKING_LIST_LIMIT));
    return this.withPayments(rows);
  }

  async listByHotel(hotelId: string, limit = BOOKING_LIST_LIMIT): Promise<BookingWithPayments[]> {
    if (!isUuid(hotelId)) return [];
    const rows = await this.db
      .select()
      .from(bookings)
      .where(eq(bookings.hotelId, hotelId))
      .orderBy(desc(bookings.createdAt), desc(bookings.id))
      .limit(Math.min(limit, BOOKING_LIST_LIMIT));
    return this.withPayments(rows);
  }

  /**
   * Inserts a `pending_payment` booking with its frozen quote and creation event.
   *
   * This deliberately opens its own transaction instead of joining the HTTP idempotency
   * transaction: the row must be committed and visible before the provider PaymentIntent is
   * created (claim-call-settle), and the partial unique index on `(owner_user_id,
   * idempotency_key)` is the second line of defence when the stored idempotent response is gone.
   */
  async createPending(input: NewPendingBookingInput): Promise<Booking> {
    try {
      return await withTransaction(this.db, async (tx) => {
        const [booking] = await tx
          .insert(bookings)
          .values({
            ownerUserId: input.ownerUserId,
            createdByUserId: input.createdByUserId,
            hotelId: input.hotelId,
            inventorySource: "managed",
            guestFirstName: input.firstName,
            guestLastName: input.lastName,
            guestEmail: input.email,
            guestPhone: input.phone ?? null,
            adultCount: input.adultCount,
            childCount: input.childCount,
            checkIn: input.checkIn,
            checkOut: input.checkOut,
            status: "pending_payment",
            totalAmountMinor: input.totalAmountMinor,
            currencyCode: input.currencyCode,
            priceSnapshot: input.priceSnapshot,
            cancellationPolicySnapshot: input.cancellationPolicySnapshot,
            idempotencyKey: input.idempotencyKey,
            specialRequests: input.specialRequests ?? null,
          })
          .returning();

        await tx.insert(bookingEvents).values({
          bookingId: booking.id,
          fromStatus: null,
          toStatus: "pending_payment",
          actorUserId: input.ownerUserId,
          reason: "booking created",
          requestId: input.requestId ?? null,
        });

        return booking;
      });
    } catch (error) {
      return throwPostgresError(error);
    }
  }

  /** Replay lookup backed by the partial unique index on the owner's idempotency key. */
  async findByOwnerAndIdempotencyKey(
    ownerUserId: string,
    idempotencyKey: string,
  ): Promise<BookingWithPayments | undefined> {
    if (!isUuid(ownerUserId) || idempotencyKey.length === 0) return undefined;
    const [row] = await this.db
      .select()
      .from(bookings)
      .where(
        and(eq(bookings.ownerUserId, ownerUserId), eq(bookings.idempotencyKey, idempotencyKey)),
      )
      .limit(1);
    if (!row) return undefined;
    const [record] = await this.withPayments([row]);
    return record;
  }

  /** Guest-facing lookup by the high-entropy public reference. */
  async findByPublicReference(publicReference: string): Promise<BookingWithPayments | undefined> {
    const [row] = await this.db
      .select()
      .from(bookings)
      .where(eq(bookings.publicReference, publicReference))
      .limit(1);
    if (!row) return undefined;
    const [record] = await this.withPayments([row]);
    return record;
  }

  /**
   * Applies one legal state change and appends its event in the same transaction. The `from`
   * predicate makes concurrent identical transitions race safely: exactly one update wins and
   * every loser receives a typed conflict instead of overwriting the winner.
   */
  async transition(input: BookingTransitionInput): Promise<Booking> {
    if (!isUuid(input.bookingId)) {
      throw new BookingTransitionConflictError(input.bookingId, input.from, input.to);
    }
    assertBookingTransition(input.from, input.to);
    return withRequestTransaction(this.db, (tx) => this.transitionInTransaction(tx, input));
  }

  /**
   * Applies a transition on a transaction owned by another repository, so a webhook can update the
   * booking and its inbox row atomically. Callers still get the typed conflict when the booking
   * moved underneath them.
   */
  async transitionOn(tx: Transaction, input: BookingTransitionInput): Promise<Booking> {
    if (!isUuid(input.bookingId)) {
      throw new BookingTransitionConflictError(input.bookingId, input.from, input.to);
    }
    assertBookingTransition(input.from, input.to);
    return this.transitionInTransaction(tx, input);
  }

  /**
   * Runs work in a transaction of its own, even when the idempotency interceptor has one open.
   * Repositories called inside join it, so a cancellation can commit `needs_review` and then let
   * the HTTP layer answer with an error.
   */
  async inDetachedTransaction<T>(run: () => Promise<T>): Promise<T> {
    return withTransaction(this.db, (tx) => runInRequestTransaction(tx, run));
  }

  /**
   * The refund plan frozen on the latest `cancelling` event. A retry refunds what the guest was
   * quoted when they cancelled, not a fresh quote taken after the policy deadline passed.
   */
  async cancellationIntent(
    bookingId: string,
  ): Promise<{ amountMinor: number; skipped?: string } | undefined> {
    if (!isUuid(bookingId)) return undefined;
    const [row] = await this.db
      .select({ metadata: bookingEvents.metadata })
      .from(bookingEvents)
      .where(and(eq(bookingEvents.bookingId, bookingId), eq(bookingEvents.toStatus, "cancelling")))
      .orderBy(desc(bookingEvents.createdAt))
      .limit(1);

    const refund = (row?.metadata as Record<string, unknown> | undefined)?.refund;
    if (typeof refund !== "object" || refund === null) return undefined;
    const { amountMinor, skipped } = refund as { amountMinor?: unknown; skipped?: unknown };
    if (typeof amountMinor !== "number" || !Number.isSafeInteger(amountMinor)) return undefined;
    return { amountMinor, ...(typeof skipped === "string" ? { skipped } : {}) };
  }

  private async transitionInTransaction(
    tx: Transaction,
    input: BookingTransitionInput,
  ): Promise<Booking> {
    assertBookingTransition(input.from, input.to);
    const systemActor = input.actor.type === "system" ? { actor: input.actor.name } : {};
    const [booking] = await tx
      .update(bookings)
      .set({
        status: input.to,
        version: sql`${bookings.version} + 1`,
        updatedAt: new Date(),
        ...((input.to === "cancelled" || input.to === "cancelling") && input.reason
          ? { cancellationReason: input.reason }
          : {}),
      })
      .where(and(eq(bookings.id, input.bookingId), eq(bookings.status, input.from)))
      .returning();

    if (!booking) {
      throw new BookingTransitionConflictError(input.bookingId, input.from, input.to);
    }

    await tx.insert(bookingEvents).values({
      bookingId: booking.id,
      fromStatus: input.from,
      toStatus: input.to,
      actorUserId: input.actor.type === "user" ? input.actor.userId : null,
      reason: input.reason ?? null,
      requestId: input.requestId ?? null,
      metadata: { ...input.metadata, ...systemActor },
    });

    return booking;
  }

  /** Derived booking totals for a bounded set of hotels. */
  async statsForHotels(hotelIds: string[]): Promise<Map<string, HotelBookingStats>> {
    const ids = [...new Set(hotelIds.filter(isUuid))];
    const result = new Map<string, HotelBookingStats>();
    if (ids.length === 0) return result;

    const rows = await this.db
      .select({
        hotelId: bookings.hotelId,
        totalBookings: sql<number>`count(*)::int`,
        totalRevenueMinor: sql<number>`coalesce(sum(${bookings.totalAmountMinor}), 0)::bigint`,
      })
      .from(bookings)
      .where(
        and(
          inArray(bookings.hotelId, ids),
          sql`${bookings.status} not in ('cancelled', 'failed', 'expired')`,
        ),
      )
      .groupBy(bookings.hotelId);

    for (const row of rows) {
      result.set(row.hotelId, {
        totalBookings: Number(row.totalBookings),
        totalRevenue: Number(row.totalRevenueMinor) / 100,
      });
    }
    return result;
  }

  /** Upcoming/completed/cancelled counts per hotel, computed in SQL. */
  async ownerCountsForHotels(hotelIds: string[]): Promise<Map<string, OwnerBookingCounts>> {
    const ids = [...new Set(hotelIds.filter(isUuid))];
    const result = new Map<string, OwnerBookingCounts>();
    if (ids.length === 0) return result;

    const rows = await this.db
      .select({
        hotelId: bookings.hotelId,
        upcomingBookings: sql<number>`count(*) filter (where ${bookings.status} not in ('cancelled', 'failed', 'expired') and ${bookings.checkOut} >= current_date)::int`,
        completedBookings: sql<number>`count(*) filter (where ${bookings.status} = 'confirmed' and ${bookings.checkOut} < current_date)::int`,
        cancelledBookings: sql<number>`count(*) filter (where ${bookings.status} = 'cancelled')::int`,
      })
      .from(bookings)
      .where(inArray(bookings.hotelId, ids))
      .groupBy(bookings.hotelId);

    for (const row of rows) {
      result.set(row.hotelId, {
        upcomingBookings: Number(row.upcomingBookings),
        completedBookings: Number(row.completedBookings),
        cancelledBookings: Number(row.cancelledBookings),
      });
    }
    return result;
  }

  async userStats(userIds: string[]): Promise<Map<string, UserBookingStats>> {
    const ids = [...new Set(userIds.filter(isUuid))];
    const result = new Map<string, UserBookingStats>();
    if (ids.length === 0) return result;

    const rows = await this.db
      .select({
        userId: bookings.ownerUserId,
        totalBookings: sql<number>`count(*)::int`,
        totalSpentMinor: sql<number>`coalesce(sum(${bookings.totalAmountMinor}), 0)::bigint`,
      })
      .from(bookings)
      .where(
        and(
          inArray(bookings.ownerUserId, ids),
          sql`${bookings.status} not in ('cancelled', 'failed', 'expired')`,
        ),
      )
      .groupBy(bookings.ownerUserId);

    for (const row of rows) {
      result.set(row.userId, {
        totalBookings: Number(row.totalBookings),
        totalSpent: Number(row.totalSpentMinor) / 100,
      });
    }
    return result;
  }

  async count(): Promise<number> {
    const [row] = await this.db.select({ count: sql<number>`count(*)::int` }).from(bookings);
    return Number(row?.count ?? 0);
  }

  /** Pending bookings old enough for the expiry job to release. */
  async listPendingPaymentBefore(cutoff: Date, limit = 100): Promise<Booking[]> {
    return this.db
      .select()
      .from(bookings)
      .where(and(eq(bookings.status, "pending_payment"), lt(bookings.createdAt, cutoff)))
      .orderBy(asc(bookings.createdAt), asc(bookings.id))
      .limit(Math.min(Math.max(limit, 1), 500));
  }

  /** Counts the reconciliation job needs to spot work that has not moved. */
  async reconciliationCounts(cutoff: Date): Promise<{
    pendingPayments: number;
    authorizedPayments: number;
    pendingBookings: number;
    confirmingBookings: number;
    needsReviewBookings: number;
  }> {
    const [paymentRows, bookingRows] = await Promise.all([
      this.db
        .select({
          pending: sql<number>`count(*) filter (where ${payments.status} = 'pending')::int`,
          authorized: sql<number>`count(*) filter (where ${payments.status} = 'authorized')::int`,
        })
        .from(payments)
        .where(lt(payments.createdAt, cutoff)),
      this.db
        .select({
          pending: sql<number>`count(*) filter (where ${bookings.status} = 'pending_payment')::int`,
          confirming: sql<number>`count(*) filter (where ${bookings.status} = 'confirming')::int`,
          needsReview: sql<number>`count(*) filter (where ${bookings.status} = 'needs_review')::int`,
        })
        .from(bookings)
        .where(lt(bookings.updatedAt, cutoff)),
    ]);

    return {
      pendingPayments: Number(paymentRows[0]?.pending ?? 0),
      authorizedPayments: Number(paymentRows[0]?.authorized ?? 0),
      pendingBookings: Number(bookingRows[0]?.pending ?? 0),
      confirmingBookings: Number(bookingRows[0]?.confirming ?? 0),
      needsReviewBookings: Number(bookingRows[0]?.needsReview ?? 0),
    };
  }

  private async withPayments(rows: Booking[]): Promise<BookingWithPayments[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const paymentRows = await this.db
      .select()
      .from(payments)
      .where(inArray(payments.bookingId, ids))
      .orderBy(asc(payments.createdAt), asc(payments.id));

    const byBooking = new Map<string, Payment[]>();
    for (const payment of paymentRows) {
      const list = byBooking.get(payment.bookingId) ?? [];
      list.push(payment);
      byBooking.set(payment.bookingId, list);
    }

    return rows.map((booking) => ({ booking, payments: byBooking.get(booking.id) ?? [] }));
  }
}
