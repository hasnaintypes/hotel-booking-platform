import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  bookingEvents,
  bookings,
  payments,
  withTransaction,
  type Booking,
  type Database,
  type Payment,
  type PaymentStatus,
  type Transaction,
} from "@hotel-booking/db";
import { throwPostgresError } from "../../common/errors/postgres-errors";
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

export type NewBookingInput = {
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
  totalCost: number;
  currencyCode?: string;
  specialRequests?: string;
  priceSnapshot?: Record<string, unknown>;
  requestId?: string;
  payment: {
    provider: string;
    providerPaymentId: string;
    amountMinor: number;
    currencyCode: string;
    status: PaymentStatus;
    paymentMethod?: string;
  };
};

export type CancelBookingInput = {
  id: string;
  actorUserId: string;
  cancellationReason?: string;
  requestId?: string;
  refund?: {
    provider: string;
    providerPaymentId: string;
    amountMinor: number;
    currencyCode: string;
    originalPaymentId: string;
  };
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

  async create(input: NewBookingInput): Promise<BookingWithPayments> {
    try {
      return await withTransaction(this.db, async (tx) => {
        const currencyCode = input.currencyCode ?? "GBP";
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
            status: "confirmed",
            totalAmountMinor: Math.round(input.totalCost * 100),
            currencyCode,
            priceSnapshot: input.priceSnapshot ?? {},
            specialRequests: input.specialRequests ?? null,
          })
          .returning();

        await tx.insert(bookingEvents).values({
          bookingId: booking.id,
          fromStatus: null,
          toStatus: "confirmed",
          actorUserId: input.ownerUserId,
          reason: "booking created",
          requestId: input.requestId ?? null,
        });

        const [payment] = await tx
          .insert(payments)
          .values({
            bookingId: booking.id,
            provider: input.payment.provider,
            providerPaymentId: input.payment.providerPaymentId,
            amountMinor: input.payment.amountMinor,
            currencyCode: input.payment.currencyCode,
            status: input.payment.status,
          })
          .returning();

        return { booking, payments: [payment] };
      });
    } catch (error) {
      return throwPostgresError(error);
    }
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
    return withTransaction(this.db, (tx) => this.transitionInTransaction(tx, input));
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
        ...(input.to === "cancelled" && input.reason ? { cancellationReason: input.reason } : {}),
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

  /**
   * Moves a cancellable booking to `cancelled` and, when a refund applies, records a separate
   * refund payment row that points at the original charge. Returns undefined when the booking
   * does not exist or is no longer cancellable.
   */
  async cancel(input: CancelBookingInput): Promise<BookingWithPayments | undefined> {
    if (!isUuid(input.id)) return undefined;

    try {
      return await withTransaction(this.db, async (tx) => {
        const [existing] = await tx
          .select()
          .from(bookings)
          .where(eq(bookings.id, input.id))
          .for("update")
          .limit(1);
        if (!existing) return undefined;
        if (
          existing.status !== "pending_payment" &&
          existing.status !== "authorized" &&
          existing.status !== "confirming" &&
          existing.status !== "confirmed"
        ) {
          return undefined;
        }

        let booking: Booking;
        try {
          booking = await this.transitionInTransaction(tx, {
            bookingId: existing.id,
            from: existing.status,
            to: "cancelled",
            actor: { type: "user", userId: input.actorUserId },
            reason: input.cancellationReason || existing.cancellationReason || undefined,
            requestId: input.requestId,
          });
        } catch (error) {
          if (error instanceof BookingTransitionConflictError) return undefined;
          throw error;
        }

        if (input.refund) {
          await tx.insert(payments).values({
            bookingId: booking.id,
            provider: input.refund.provider,
            providerPaymentId: input.refund.providerPaymentId,
            amountMinor: input.refund.amountMinor,
            currencyCode: input.refund.currencyCode,
            status: "refunded",
            originalPaymentId: input.refund.originalPaymentId,
          });
        }

        const paymentRows = await tx
          .select()
          .from(payments)
          .where(eq(payments.bookingId, booking.id))
          .orderBy(asc(payments.createdAt));

        return { booking, payments: paymentRows };
      });
    } catch (error) {
      return throwPostgresError(error);
    }
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
