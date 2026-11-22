import { z } from "zod";
import { bookingPaymentStatusSchema, bookingStatusSchema } from "./bookings";
import { isoDateSchema, isoDateTimeSchema } from "./primitives";

const count = z.number().int();

/**
 * `GET /api/v1/admin/reports/overview`. The service has already converted money from minor units
 * to pounds, so every number here is the value the dashboard displays.
 */
export const reportsOverviewSchema = z.object({
  overview: z.object({
    totalHotels: count,
    totalUsers: count,
    totalBookings: count,
    recentBookings: count,
    totalRevenue: z.number(),
    recentRevenue: z.number(),
    revenueGrowth: z.number(),
    cancelledBookings: count,
    confirmedBookings: count,
    pendingBookings: count,
    refundedBookings: count,
    totalRefundAmount: z.number(),
    cancellationRate: z.number(),
    totalReviews: count,
    avgReviewRating: z.number(),
    avgLos: z.number(),
    adr: z.number(),
    avgPartySize: z.number(),
    verifiedReviewCount: count,
  }),
  popularDestinations: z.array(
    z.object({
      /** The city name; the legacy analytics payload calls it `_id`. */
      _id: z.string(),
      count,
      totalRevenue: z.number(),
      avgPrice: z.number(),
    }),
  ),
  dailyBookings: z.array(z.object({ date: isoDateSchema, bookings: count })),
  hotelPerformance: z.array(
    z.object({
      /** The hotel id; the legacy analytics payload calls it `_id`. */
      _id: z.string(),
      name: z.string(),
      city: z.string(),
      starRating: z.number(),
      pricePerNight: z.number(),
      bookingCount: count,
      totalRevenue: z.number(),
    }),
  ),
  /** Zero-count statuses are dropped and the rows are sorted by count, so this may be empty. */
  bookingStatusBreakdown: z.array(z.object({ status: bookingStatusSchema, count })),
  /** Same rules as the booking-status breakdown. */
  paymentStatusBreakdown: z.array(z.object({ status: bookingPaymentStatusSchema, count })),
  guestMix: z.object({ adults: count, children: count }),
  reviewCategoryAverages: z.object({
    cleanliness: z.number(),
    service: z.number(),
    location: z.number(),
    value: z.number(),
    amenities: z.number(),
  }),
  hotelsByStar: z.array(z.object({ starRating: z.number(), count })),
  lastUpdated: isoDateTimeSchema,
});

/** `GET /api/v1/admin/reports/forecast`. Both arrays may be short or empty. */
export const forecastReportSchema = z.object({
  historical: z.array(z.object({ week: isoDateSchema, bookings: count, revenue: z.number() })),
  forecasts: z.array(
    z.object({
      week: isoDateSchema,
      bookings: count,
      revenue: z.number(),
      confidence: z.number().min(0.6).max(0.9),
    }),
  ),
  seasonalGrowth: z.number(),
  trends: z.object({
    bookingTrend: z.enum(["increasing", "decreasing", "stable"]),
    revenueTrend: z.enum(["increasing", "decreasing", "stable"]),
  }),
  lastUpdated: isoDateTimeSchema,
});

/** `GET /api/v1/admin/reports/system-stats`. `uptime` is whole seconds. */
export const systemStatsSchema = z.object({
  database: z.object({
    totalHotels: count,
    totalBookings: count,
    totalRevenue: z.number(),
  }),
  application: z.object({ todayBookings: count, thisWeekBookings: count }),
  system: z.object({
    memory: z.object({ used: count, total: count, percentage: count }),
    uptime: count,
  }),
  lastUpdated: isoDateTimeSchema,
});

export type ReportsOverview = z.infer<typeof reportsOverviewSchema>;
export type ForecastReport = z.infer<typeof forecastReportSchema>;
export type SystemStats = z.infer<typeof systemStatsSchema>;
