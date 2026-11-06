import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import {
  analyticsSnapshots,
  bookings,
  hotelHotelTypes,
  hotels,
  hotelTypes,
  payments,
  reviews,
  users,
  type AnalyticsDestinationTotal,
  type AnalyticsHotelTypeTotal,
  type AnalyticsPaymentBreakdown,
  type AnalyticsSnapshot,
  type AnalyticsStatusBreakdown,
  type BookingStatus,
  type Database,
  type NewAnalyticsSnapshot,
  type PaymentStatus,
} from "@hotel-booking/db";
import { throwPostgresError } from "../../common/errors/postgres-errors";
import { DATABASE } from "../postgres.database";

const DAY_MS = 24 * 60 * 60 * 1000;
export const SNAPSHOT_LIST_LIMIT = 50;

export type AnalyticsOverview = {
  totalBookings: number;
  totalRevenueMinor: number;
  recentBookings: number;
  recentRevenueMinor: number;
  currentMonthRevenueMinor: number;
  previousMonthRevenueMinor: number;
  currentMonthBookings: number;
  previousMonthBookings: number;
  todayBookings: number;
  weekBookings: number;
  cancelledBookings: number;
  confirmedBookings: number;
  pendingBookings: number;
  refundedBookings: number;
  totalRefundMinor: number;
  totalNights: number;
  totalAdults: number;
  totalHotels: number;
  totalUsers: number;
  totalChildren: number;
};

export type DestinationTotal = {
  city: string;
  count: number;
  revenueMinor: number;
  averagePriceMinor: number;
};

export type HotelPerformanceTotal = {
  id: string;
  name: string;
  city: string;
  starRating: number;
  pricePerNightMinor: number;
  bookingCount: number;
  totalRevenueMinor: number;
};

export type WeeklyTotal = {
  week: string;
  bookings: number;
  revenueMinor: number;
};

export type ReviewAnalytics = {
  totalReviews: number;
  verifiedReviewCount: number;
  averageRating: number;
  categories: {
    cleanliness: number;
    service: number;
    location: number;
    value: number;
    amenities: number;
  };
};

export type SnapshotInput = Omit<NewAnalyticsSnapshot, "id" | "date" | "createdAt" | "updatedAt">;

const emptyStatusBreakdown = (): AnalyticsStatusBreakdown => ({
  pending: 0,
  confirmed: 0,
  cancelled: 0,
  completed: 0,
  refunded: 0,
});

const emptyPaymentBreakdown = (): AnalyticsPaymentBreakdown => ({
  pending: 0,
  paid: 0,
  failed: 0,
  refunded: 0,
});

const clampLimit = (value: number, fallback: number, max = SNAPSHOT_LIST_LIMIT) => {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.floor(value), max);
};

/** Read model for cross-table reporting. Every query aggregates or returns a bounded page. */
@Injectable()
export class AnalyticsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async overview(): Promise<AnalyticsOverview> {
    const refundedPaymentExists = sql<boolean>`exists (
      select 1 from ${payments} refund
      where refund.booking_id = ${bookings.id}
        and refund.original_payment_id is not null
        and refund.status = 'refunded'
    )`;

    const [row] = await this.db
      .select({
        totalBookings: sql<number>`count(*)::int`,
        totalRevenueMinor: sql<number>`coalesce(sum(${bookings.totalAmountMinor}), 0)::bigint`,
        recentBookings: sql<number>`count(*) filter (where ${bookings.createdAt} >= now() - interval '30 days')::int`,
        recentRevenueMinor: sql<number>`coalesce(sum(${bookings.totalAmountMinor}) filter (
          where ${bookings.createdAt} >= now() - interval '30 days'
        ), 0)::bigint`,
        currentMonthRevenueMinor: sql<number>`coalesce(sum(${bookings.totalAmountMinor}) filter (
          where ${bookings.createdAt} >= date_trunc('month', now())
        ), 0)::bigint`,
        previousMonthRevenueMinor: sql<number>`coalesce(sum(${bookings.totalAmountMinor}) filter (
          where ${bookings.createdAt} >= date_trunc('month', now()) - interval '1 month'
            and ${bookings.createdAt} < date_trunc('month', now())
        ), 0)::bigint`,
        currentMonthBookings: sql<number>`count(*) filter (
          where ${bookings.createdAt} >= date_trunc('month', now())
        )::int`,
        previousMonthBookings: sql<number>`count(*) filter (
          where ${bookings.createdAt} >= date_trunc('month', now()) - interval '1 month'
            and ${bookings.createdAt} < date_trunc('month', now())
        )::int`,
        todayBookings: sql<number>`count(*) filter (
          where ${bookings.createdAt} >= date_trunc('day', now())
        )::int`,
        weekBookings: sql<number>`count(*) filter (
          where ${bookings.createdAt} >= now() - interval '7 days'
        )::int`,
        cancelledBookings: sql<number>`count(*) filter (where ${bookings.status} = 'cancelled')::int`,
        confirmedBookings: sql<number>`count(*) filter (
          where ${bookings.status} in ('confirmed', 'completed')
        )::int`,
        pendingBookings: sql<number>`count(*) filter (where ${bookings.status} = 'pending')::int`,
        refundedBookings: sql<number>`count(*) filter (
          where ${bookings.status} = 'refunded' or ${refundedPaymentExists}
        )::int`,
        totalNights: sql<number>`coalesce(sum(greatest(1, ${bookings.checkOut} - ${bookings.checkIn})), 0)::int`,
        totalAdults: sql<number>`coalesce(sum(${bookings.adultCount}), 0)::int`,
        totalChildren: sql<number>`coalesce(sum(${bookings.childCount}), 0)::int`,
        totalHotels: sql<number>`(select count(*) from ${hotels})::int`,
        totalUsers: sql<number>`(select count(*) from ${users})::int`,
      })
      .from(bookings);

    const [refund] = await this.db
      .select({ total: sql<number>`coalesce(sum(${payments.amountMinor}), 0)::bigint` })
      .from(payments)
      .where(and(isNotNull(payments.originalPaymentId), eq(payments.status, "refunded")));

    return {
      totalBookings: Number(row?.totalBookings) || 0,
      totalRevenueMinor: Number(row?.totalRevenueMinor) || 0,
      recentBookings: Number(row?.recentBookings) || 0,
      recentRevenueMinor: Number(row?.recentRevenueMinor) || 0,
      currentMonthRevenueMinor: Number(row?.currentMonthRevenueMinor) || 0,
      previousMonthRevenueMinor: Number(row?.previousMonthRevenueMinor) || 0,
      currentMonthBookings: Number(row?.currentMonthBookings) || 0,
      previousMonthBookings: Number(row?.previousMonthBookings) || 0,
      todayBookings: Number(row?.todayBookings) || 0,
      weekBookings: Number(row?.weekBookings) || 0,
      cancelledBookings: Number(row?.cancelledBookings) || 0,
      confirmedBookings: Number(row?.confirmedBookings) || 0,
      pendingBookings: Number(row?.pendingBookings) || 0,
      refundedBookings: Number(row?.refundedBookings) || 0,
      totalRefundMinor: Number(refund?.total) || 0,
      totalNights: Number(row?.totalNights) || 0,
      totalAdults: Number(row?.totalAdults) || 0,
      totalChildren: Number(row?.totalChildren) || 0,
      totalHotels: Number(row?.totalHotels) || 0,
      totalUsers: Number(row?.totalUsers) || 0,
    };
  }

  async bookingStatusBreakdown(): Promise<AnalyticsStatusBreakdown> {
    const rows = await this.db
      .select({ status: bookings.status, count: sql<number>`count(*)::int` })
      .from(bookings)
      .groupBy(bookings.status);
    const result = emptyStatusBreakdown();
    for (const row of rows) {
      const status = row.status as BookingStatus;
      if (status in result) result[status] = Number(row.count) || 0;
    }
    return result;
  }

  async paymentStatusBreakdown(): Promise<AnalyticsPaymentBreakdown> {
    const chargeStatus = sql<string>`coalesce((
      select charge.status::text from ${payments} charge
      where charge.booking_id = ${bookings.id} and charge.original_payment_id is null
      order by charge.created_at asc
      limit 1
    ), 'pending')`;
    const refunded = sql<boolean>`${bookings.status} = 'refunded' or exists (
      select 1 from ${payments} refund
      where refund.booking_id = ${bookings.id}
        and refund.original_payment_id is not null
        and refund.status = 'refunded'
    )`;
    const paymentStatus = sql<string>`case
      when ${refunded} then 'refunded'
      when ${chargeStatus} in ('paid', 'failed', 'refunded') then ${chargeStatus}
      else 'pending'
    end`;

    const rows = await this.db
      .select({ status: paymentStatus, count: sql<number>`count(*)::int` })
      .from(bookings)
      .groupBy(paymentStatus);

    const result = emptyPaymentBreakdown();
    for (const row of rows) {
      const status = row.status as PaymentStatus;
      if (status in result) result[status] = Number(row.count) || 0;
    }
    return result;
  }

  async dailyBookings(days = 7): Promise<Array<{ date: string; bookings: number }>> {
    const since = new Date(Date.now() - (clampLimit(days, 7, 30) - 1) * DAY_MS);
    const date = sql<string>`to_char(${bookings.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`;
    const rows = await this.db
      .select({ date, bookings: sql<number>`count(*)::int` })
      .from(bookings)
      .where(gte(bookings.createdAt, since))
      .groupBy(date)
      .orderBy(date)
      .limit(31);
    return rows.map((row) => ({ date: row.date, bookings: Number(row.bookings) || 0 }));
  }

  async popularDestinations(limit = 5): Promise<DestinationTotal[]> {
    const take = clampLimit(limit, 5, 20);
    const rows = await this.db
      .select({
        city: hotels.city,
        count: sql<number>`count(*)::int`,
        revenueMinor: sql<number>`coalesce(sum(${bookings.totalAmountMinor}), 0)::bigint`,
      })
      .from(bookings)
      .innerJoin(hotels, eq(hotels.id, bookings.hotelId))
      .groupBy(hotels.city)
      .orderBy(desc(sql`count(*)`))
      .limit(take);

    if (rows.length === 0) return this.hotelDestinations(take);

    const cities = rows.map((row) => row.city);
    const prices = await this.db
      .select({
        city: hotels.city,
        averagePriceMinor: sql<number>`coalesce(avg(${hotels.pricePerNightMinor}), 0)::float`,
      })
      .from(hotels)
      .where(
        and(
          inArray(hotels.city, cities),
          sql`exists (select 1 from ${bookings} booked where booked.hotel_id = ${hotels.id})`,
        ),
      )
      .groupBy(hotels.city);
    const priceByCity = new Map(prices.map((row) => [row.city, Number(row.averagePriceMinor)]));

    return rows.map((row) => ({
      city: row.city,
      count: Number(row.count) || 0,
      revenueMinor: Number(row.revenueMinor) || 0,
      averagePriceMinor: priceByCity.get(row.city) ?? 0,
    }));
  }

  private async hotelDestinations(limit: number): Promise<DestinationTotal[]> {
    const rows = await this.db
      .select({
        city: hotels.city,
        count: sql<number>`count(*)::int`,
        averagePriceMinor: sql<number>`coalesce(avg(${hotels.pricePerNightMinor}), 0)::float`,
      })
      .from(hotels)
      .groupBy(hotels.city)
      .orderBy(desc(sql`count(*)`))
      .limit(limit);
    return rows.map((row) => ({
      city: row.city,
      count: Number(row.count) || 0,
      revenueMinor: 0,
      averagePriceMinor: Number(row.averagePriceMinor) || 0,
    }));
  }

  async hotelPerformance(limit = 10): Promise<HotelPerformanceTotal[]> {
    const take = clampLimit(limit, 10, 50);
    const rows = await this.db
      .select({
        id: hotels.id,
        name: hotels.name,
        city: hotels.city,
        starRating: hotels.starRating,
        pricePerNightMinor: hotels.pricePerNightMinor,
        bookingCount: sql<number>`count(*)::int`,
        totalRevenueMinor: sql<number>`coalesce(sum(${bookings.totalAmountMinor}), 0)::bigint`,
      })
      .from(bookings)
      .innerJoin(hotels, eq(hotels.id, bookings.hotelId))
      .groupBy(hotels.id, hotels.name, hotels.city, hotels.starRating, hotels.pricePerNightMinor)
      .orderBy(desc(sql`count(*)`))
      .limit(take);

    if (rows.length > 0) {
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        city: row.city,
        starRating: Number(row.starRating) || 0,
        pricePerNightMinor: Number(row.pricePerNightMinor) || 0,
        bookingCount: Number(row.bookingCount) || 0,
        totalRevenueMinor: Number(row.totalRevenueMinor) || 0,
      }));
    }

    const hotelRows = await this.db
      .select({
        id: hotels.id,
        name: hotels.name,
        city: hotels.city,
        starRating: hotels.starRating,
        pricePerNightMinor: hotels.pricePerNightMinor,
      })
      .from(hotels)
      .orderBy(desc(hotels.starRating), hotels.name)
      .limit(take);
    return hotelRows.map((row) => ({
      id: row.id,
      name: row.name,
      city: row.city,
      starRating: Number(row.starRating) || 0,
      pricePerNightMinor: Number(row.pricePerNightMinor) || 0,
      bookingCount: 0,
      totalRevenueMinor: 0,
    }));
  }

  async reviewAnalytics(): Promise<ReviewAnalytics> {
    const [row] = await this.db
      .select({
        totalReviews: sql<number>`count(*)::int`,
        verifiedReviewCount: sql<number>`count(*) filter (where ${reviews.isVerified})::int`,
        averageRating: sql<number>`coalesce(avg(${reviews.rating}), 0)::float`,
        cleanliness: sql<number>`coalesce(avg(${reviews.cleanliness}), 0)::float`,
        service: sql<number>`coalesce(avg(${reviews.service}), 0)::float`,
        location: sql<number>`coalesce(avg(${reviews.location}), 0)::float`,
        value: sql<number>`coalesce(avg(${reviews.value}), 0)::float`,
        amenities: sql<number>`coalesce(avg(${reviews.amenities}), 0)::float`,
      })
      .from(reviews);

    return {
      totalReviews: Number(row?.totalReviews) || 0,
      verifiedReviewCount: Number(row?.verifiedReviewCount) || 0,
      averageRating: Number(row?.averageRating) || 0,
      categories: {
        cleanliness: Number(row?.cleanliness) || 0,
        service: Number(row?.service) || 0,
        location: Number(row?.location) || 0,
        value: Number(row?.value) || 0,
        amenities: Number(row?.amenities) || 0,
      },
    };
  }

  async weeklyTotals(days = 60): Promise<WeeklyTotal[]> {
    const since = new Date(Date.now() - clampLimit(days, 60, 120) * DAY_MS);
    const week = sql<string>`to_char(date_trunc('week', ${bookings.createdAt}), 'YYYY-MM-DD')`;
    const rows = await this.db
      .select({
        week,
        bookings: sql<number>`count(*)::int`,
        revenueMinor: sql<number>`coalesce(sum(${bookings.totalAmountMinor}), 0)::bigint`,
      })
      .from(bookings)
      .where(gte(bookings.createdAt, since))
      .groupBy(week)
      .orderBy(week)
      .limit(18);
    return rows.map((row) => ({
      week: row.week,
      bookings: Number(row.bookings) || 0,
      revenueMinor: Number(row.revenueMinor) || 0,
    }));
  }

  async destinationTotals(limit = 10): Promise<AnalyticsDestinationTotal[]> {
    const rows = await this.pastDestinationTotals(clampLimit(limit, 10, 50));
    if (rows.length > 0) return rows;
    return this.hotelDestinations(limit).then((destinations) =>
      destinations.map((destination) => ({
        city: destination.city,
        bookings: 0,
        revenueMinor: 0,
      })),
    );
  }

  private async pastDestinationTotals(limit: number): Promise<AnalyticsDestinationTotal[]> {
    const rows = await this.db
      .select({
        city: hotels.city,
        bookings: sql<number>`count(*)::int`,
        revenueMinor: sql<number>`coalesce(sum(${bookings.totalAmountMinor}), 0)::bigint`,
      })
      .from(bookings)
      .innerJoin(hotels, eq(hotels.id, bookings.hotelId))
      .groupBy(hotels.city)
      .orderBy(desc(sql`count(*)`))
      .limit(limit);
    return rows.map((row) => ({
      city: row.city,
      bookings: Number(row.bookings) || 0,
      revenueMinor: Number(row.revenueMinor) || 0,
    }));
  }

  async hotelTypeTotals(limit = 10): Promise<AnalyticsHotelTypeTotal[]> {
    const take = clampLimit(limit, 10, 50);
    const rows = await this.db
      .select({
        type: hotelTypes.name,
        bookings: sql<number>`count(*)::int`,
        revenueMinor: sql<number>`coalesce(sum(${bookings.totalAmountMinor}), 0)::bigint`,
      })
      .from(hotelHotelTypes)
      .innerJoin(hotelTypes, eq(hotelTypes.id, hotelHotelTypes.hotelTypeId))
      .innerJoin(bookings, eq(bookings.hotelId, hotelHotelTypes.hotelId))
      .groupBy(hotelTypes.name)
      .orderBy(desc(sql`count(*)`))
      .limit(take);

    const [unknown] = await this.db
      .select({
        bookings: sql<number>`count(*)::int`,
        revenueMinor: sql<number>`coalesce(sum(${bookings.totalAmountMinor}), 0)::bigint`,
      })
      .from(bookings)
      .where(
        sql`not exists (
          select 1 from ${hotelHotelTypes} typed where typed.hotel_id = ${bookings.hotelId}
        )`,
      );

    const result: AnalyticsHotelTypeTotal[] = rows.map((row) => ({
      type: row.type,
      bookings: Number(row.bookings) || 0,
      revenueMinor: Number(row.revenueMinor) || 0,
    }));
    if (Number(unknown?.bookings) > 0) {
      result.push({
        type: "Unknown",
        bookings: Number(unknown?.bookings) || 0,
        revenueMinor: Number(unknown?.revenueMinor) || 0,
      });
    }
    return result.sort((a, b) => b.bookings - a.bookings).slice(0, take);
  }

  async buildSnapshot(): Promise<SnapshotInput> {
    const [overview, byStatus, byPaymentStatus, destinations, hotelTypes, reviewStats] =
      await Promise.all([
        this.overview(),
        this.bookingStatusBreakdown(),
        this.paymentStatusBreakdown(),
        this.destinationTotals(10),
        this.hotelTypeTotals(10),
        this.reviewAnalytics(),
      ]);

    const cancelled = byStatus.cancelled + byStatus.refunded;
    const cancellationRate =
      overview.totalBookings > 0 ? Math.round((cancelled / overview.totalBookings) * 1000) / 10 : 0;
    const averageBookingValueMinor =
      overview.totalBookings > 0
        ? Math.round(overview.totalRevenueMinor / overview.totalBookings)
        : 0;
    const averageRating = Math.round(reviewStats.averageRating * 10) / 10;

    return {
      totalBookings: overview.totalBookings,
      totalRevenueMinor: overview.totalRevenueMinor,
      totalUsers: overview.totalUsers,
      totalHotels: overview.totalHotels,
      averageBookingValueMinor,
      cancellationRate,
      averageRating,
      byStatus,
      byPaymentStatus,
      byDestination: destinations,
      byHotelType: hotelTypes,
    };
  }

  async listSnapshots(limit = 20): Promise<AnalyticsSnapshot[]> {
    return this.db
      .select()
      .from(analyticsSnapshots)
      .orderBy(desc(analyticsSnapshots.date), desc(analyticsSnapshots.id))
      .limit(clampLimit(limit, 20));
  }

  async createSnapshot(input: SnapshotInput): Promise<AnalyticsSnapshot> {
    try {
      const [snapshot] = await this.db
        .insert(analyticsSnapshots)
        .values({ ...input, date: new Date() })
        .returning();
      return snapshot;
    } catch (error) {
      return throwPostgresError(error);
    }
  }
}

export type RollupResponse = {
  _id: string;
  date: Date;
  metrics: {
    totalBookings: number;
    totalRevenue: number;
    totalUsers: number;
    totalHotels: number;
    averageBookingValue: number;
    cancellationRate: number;
    averageRating: number;
  };
  breakdown: {
    byStatus: AnalyticsStatusBreakdown;
    byPaymentStatus: AnalyticsPaymentBreakdown;
    byDestination: Array<{ city: string; bookings: number; revenue: number }>;
    byHotelType: Array<{ type: string; bookings: number; revenue: number }>;
  };
  createdAt: Date;
  updatedAt: Date;
};

const round2 = (value: number) => Math.round((value || 0) * 100) / 100;
const toPounds = (minor: number) => round2(minor / 100);

export const toRollupResponse = (snapshot: AnalyticsSnapshot): RollupResponse => ({
  _id: snapshot.id,
  date: snapshot.date,
  metrics: {
    totalBookings: snapshot.totalBookings,
    totalRevenue: toPounds(snapshot.totalRevenueMinor),
    totalUsers: snapshot.totalUsers,
    totalHotels: snapshot.totalHotels,
    averageBookingValue: toPounds(snapshot.averageBookingValueMinor),
    cancellationRate: snapshot.cancellationRate,
    averageRating: snapshot.averageRating,
  },
  breakdown: {
    byStatus: snapshot.byStatus,
    byPaymentStatus: snapshot.byPaymentStatus,
    byDestination: snapshot.byDestination.map((destination) => ({
      city: destination.city,
      bookings: destination.bookings,
      revenue: toPounds(destination.revenueMinor),
    })),
    byHotelType: snapshot.byHotelType.map((type) => ({
      type: type.type,
      bookings: type.bookings,
      revenue: toPounds(type.revenueMinor),
    })),
  },
  createdAt: snapshot.createdAt,
  updatedAt: snapshot.updatedAt,
});
