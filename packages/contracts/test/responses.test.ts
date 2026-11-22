import { describe, expect, it } from "vitest";
import {
  BOOKING_PAYMENT_STATUS_VALUES,
  BOOKING_STATUS_VALUES,
  forecastReportSchema,
  healthStatusSchema,
  jobQueueMetricsSchema,
  loginResponseSchema,
  offerSchema,
  partnerCapabilitiesSchema,
  readinessSchema,
  reportsOverviewSchema,
  rollupPageSchema,
  rollupSchema,
  stripeWebhookAckSchema,
  suggestResponseSchema,
  systemHealthSchema,
  systemStatsSchema,
} from "../src";

const UUID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const ISO = "2026-01-01T00:00:00.000Z";

const cancellationPolicy = {
  version: 1 as const,
  source: "supplier" as const,
  freeCancelHoursBeforeArrival: 48,
  penalty: { type: "full" as const },
};

const offer = {
  id: UUID,
  source: "supplier" as const,
  hotelId: UUID,
  checkIn: "2026-06-13",
  checkOut: "2026-06-16",
  adultCount: 2,
  childCount: 0,
  totalMinor: 25_000,
  totalCost: 250,
  currency: "GBP",
  cancellationPolicy,
  rateOptions: [
    {
      id: "supplier-flex",
      boardBasis: "breakfast" as const,
      totalMinor: 25_000,
      totalCost: 250,
      currency: "GBP",
    },
  ],
  expiresAt: ISO,
};

describe("loginResponseSchema", () => {
  it("parses the login payload without the cookie token", () => {
    const login = {
      userId: UUID,
      message: "Login successful" as const,
      user: { id: UUID, email: "grace@example.test", firstName: "", lastName: "Hopper" },
    };

    expect(loginResponseSchema.parse(login)).toEqual(login);
  });

  it("rejects a different message or a missing user id", () => {
    expect(loginResponseSchema.safeParse({ userId: UUID, message: "ok", user: {} }).success).toBe(
      false,
    );
  });

  it("strips accidental extra keys instead of widening the wire contract", () => {
    const parsed = loginResponseSchema.parse({
      userId: UUID,
      message: "Login successful",
      token: "should-not-be-here",
      user: { id: UUID, email: "a@b.test", firstName: "A", lastName: "B", role: "admin" },
    });

    expect(parsed).not.toHaveProperty("token");
    expect(parsed.user).not.toHaveProperty("role");
  });
});

describe("offerSchema", () => {
  it("parses a supplier offer with a full penalty and no rawText", () => {
    expect(offerSchema.parse(offer)).toEqual(offer);
  });

  it("accepts a managed offer with a percent penalty and raw text", () => {
    const managed = {
      ...offer,
      source: "managed" as const,
      cancellationPolicy: {
        ...cancellationPolicy,
        source: "managed" as const,
        penalty: { type: "percent" as const, percent: 50 },
        rawText: "Free cancellation up to 48 hours before arrival.",
      },
    };

    expect(offerSchema.parse(managed).cancellationPolicy.rawText).toContain("Free cancellation");
  });

  it("accepts a nights penalty and a null free-cancellation window", () => {
    const nights = {
      ...offer,
      cancellationPolicy: {
        ...cancellationPolicy,
        freeCancelHoursBeforeArrival: null,
        penalty: { type: "nights" as const, nights: 2 },
      },
    };

    expect(offerSchema.parse(nights).cancellationPolicy.penalty).toEqual({
      type: "nights",
      nights: 2,
    });
  });

  it("rejects an unknown board basis or penalty type", () => {
    expect(
      offerSchema.safeParse({
        ...offer,
        rateOptions: [{ ...offer.rateOptions[0], boardBasis: "dinner" }],
      }).success,
    ).toBe(false);
    expect(
      offerSchema.safeParse({
        ...offer,
        cancellationPolicy: { ...cancellationPolicy, penalty: { type: "mystery" } },
      }).success,
    ).toBe(false);
  });
});

describe("suggestResponseSchema", () => {
  it("allows the stub answer to omit the model", () => {
    expect(
      suggestResponseSchema.parse({
        draft: "A calm hotel.",
        provider: "stub",
        usedFallback: false,
      }),
    ).toEqual({ draft: "A calm hotel.", provider: "stub", usedFallback: false });
  });

  it("accepts a provider answer with its model", () => {
    expect(
      suggestResponseSchema.parse({
        draft: "A calm hotel.",
        provider: "groq",
        model: "openai/gpt-oss-20b",
        usedFallback: true,
      }).model,
    ).toBe("openai/gpt-oss-20b");
  });
});

const overview = {
  overview: {
    totalHotels: 2,
    totalUsers: 5,
    totalBookings: 3,
    recentBookings: 1,
    totalRevenue: 540,
    recentRevenue: 180,
    revenueGrowth: 12.5,
    cancelledBookings: 0,
    confirmedBookings: 2,
    pendingBookings: 1,
    refundedBookings: 0,
    totalRefundAmount: 0,
    cancellationRate: 0,
    totalReviews: 1,
    avgReviewRating: 4.5,
    avgLos: 2.5,
    adr: 180,
    avgPartySize: 2,
    verifiedReviewCount: 1,
  },
  popularDestinations: [],
  dailyBookings: [],
  hotelPerformance: [],
  bookingStatusBreakdown: [],
  paymentStatusBreakdown: [],
  guestMix: { adults: 4, children: 0 },
  reviewCategoryAverages: {
    cleanliness: 4,
    service: 4,
    location: 5,
    value: 4,
    amenities: 3,
  },
  hotelsByStar: [],
  lastUpdated: ISO,
};

describe("reportsOverviewSchema", () => {
  it("parses an empty dashboard and the populated breakdowns", () => {
    expect(reportsOverviewSchema.parse(overview)).toEqual(overview);

    const populated = {
      ...overview,
      dailyBookings: [{ date: "2026-06-13", bookings: 2 }],
      bookingStatusBreakdown: [{ status: "confirmed" as const, count: 2 }],
      paymentStatusBreakdown: [{ status: "paid" as const, count: 2 }],
      hotelsByStar: [{ starRating: 4, count: 2 }],
    };

    expect(reportsOverviewSchema.parse(populated).dailyBookings[0]?.date).toBe("2026-06-13");
  });

  it("rejects an unknown booking status in the breakdown", () => {
    expect(
      reportsOverviewSchema.safeParse({
        ...overview,
        bookingStatusBreakdown: [{ status: "booked", count: 1 }],
      }).success,
    ).toBe(false);
  });

  it("rejects a Date where the wire has an ISO string", () => {
    expect(reportsOverviewSchema.safeParse({ ...overview, lastUpdated: new Date() }).success).toBe(
      false,
    );
  });
});

describe("forecastReportSchema", () => {
  it("parses one historical week with a stable trend", () => {
    const forecast = {
      historical: [{ week: "2026-06-08", bookings: 2, revenue: 360 }],
      forecasts: [{ week: "2026-06-15", bookings: 2, revenue: 396, confidence: 0.6 }],
      seasonalGrowth: 0,
      trends: { bookingTrend: "stable" as const, revenueTrend: "stable" as const },
      lastUpdated: ISO,
    };

    expect(forecastReportSchema.parse(forecast)).toEqual(forecast);
  });

  it("rejects confidence outside the range the service emits", () => {
    expect(
      forecastReportSchema.safeParse({
        historical: [],
        forecasts: [{ week: "2026-06-15", bookings: 0, revenue: 0, confidence: 1 }],
        seasonalGrowth: 0,
        trends: { bookingTrend: "stable", revenueTrend: "stable" },
        lastUpdated: ISO,
      }).success,
    ).toBe(false);
  });
});

describe("systemStatsSchema", () => {
  it("parses the measured figures", () => {
    const stats = {
      database: { totalHotels: 1, totalBookings: 0, totalRevenue: 0 },
      application: { todayBookings: 0, thisWeekBookings: 0 },
      system: { memory: { used: 40, total: 80, percentage: 50 }, uptime: 123 },
      lastUpdated: ISO,
    };

    expect(systemStatsSchema.parse(stats)).toEqual(stats);
  });
});

const rollup = {
  _id: UUID,
  date: ISO,
  metrics: {
    totalBookings: 3,
    totalRevenue: 540,
    totalUsers: 5,
    totalHotels: 2,
    averageBookingValue: 180,
    cancellationRate: 0,
    averageRating: 4.5,
  },
  breakdown: {
    byStatus: Object.fromEntries(BOOKING_STATUS_VALUES.map((status) => [status, 0])),
    byPaymentStatus: Object.fromEntries(BOOKING_PAYMENT_STATUS_VALUES.map((status) => [status, 0])),
    byDestination: [{ city: "Paris", bookings: 2, revenue: 360 }],
    byHotelType: [{ type: "Boutique", bookings: 2, revenue: 360 }],
  },
  createdAt: ISO,
  updatedAt: ISO,
};

describe("rollupSchema", () => {
  it("requires every booking and payment status key", () => {
    expect(Object.keys(rollupSchema.parse(rollup).breakdown.byStatus)).toEqual(
      BOOKING_STATUS_VALUES,
    );
    expect(Object.keys(rollupSchema.parse(rollup).breakdown.byPaymentStatus)).toEqual(
      BOOKING_PAYMENT_STATUS_VALUES,
    );
  });

  it("rejects a snapshot missing a status key", () => {
    const { confirmed: _removed, ...partial } = rollup.breakdown.byStatus;
    expect(
      rollupSchema.safeParse({
        ...rollup,
        breakdown: { ...rollup.breakdown, byStatus: partial },
      }).success,
    ).toBe(false);
  });

  it("wraps a cursor page and strips unknown top-level keys", () => {
    const page = rollupPageSchema.parse({
      data: [{ ...rollup, conversionRate: 99 }],
      pageInfo: { nextCursor: null, hasMore: false },
      extra: true,
    });

    expect(page.data[0]).not.toHaveProperty("conversionRate");
    expect(page).not.toHaveProperty("extra");
  });
});

describe("health and readiness schemas", () => {
  it("parses liveness and a flat readiness body with unknown migrations", () => {
    expect(healthStatusSchema.parse({ status: "ok", timestamp: ISO })).toEqual({
      status: "ok",
      timestamp: ISO,
    });

    expect(
      readinessSchema.parse({
        status: "not_ready",
        timestamp: ISO,
        postgres: "connected",
        migrations: "unknown",
      }).migrations,
    ).toBe("unknown");
  });

  it("parses the nested admin health body", () => {
    const health = {
      status: "unhealthy" as const,
      timestamp: ISO,
      performance: {
        memory: { usedMb: 40, totalMb: 80, percentage: 50 },
        uptime: 123,
      },
      checks: { postgres: "disconnected" as const, migrations: "pending" as const },
    };

    expect(systemHealthSchema.parse(health)).toEqual(health);
  });

  it("allows a null oldest age in the queue metrics", () => {
    const metrics = {
      enabled: false,
      queues: [
        {
          name: "bookings.expire-pending",
          queued: 0,
          active: 0,
          failed: 0,
          oldestReadySeconds: null,
        },
      ],
      totals: { queued: 0, active: 0, failed: 0, oldestReadySeconds: null },
      outbox: { pending: 0, dispatching: 0, failed: 0, oldestPendingSeconds: null },
    };

    expect(jobQueueMetricsSchema.parse(metrics)).toEqual(metrics);
  });
});

describe("small acknowledgement schemas", () => {
  it("parses a Stripe acknowledgement", () => {
    expect(stripeWebhookAckSchema.parse({ received: true, duplicate: false })).toEqual({
      received: true,
      duplicate: false,
    });
    expect(stripeWebhookAckSchema.safeParse({ received: false, duplicate: false }).success).toBe(
      false,
    );
  });

  it("pins the partner capability literals", () => {
    expect(partnerCapabilitiesSchema.parse({ audience: "partner", available: false })).toEqual({
      audience: "partner",
      available: false,
    });
    expect(
      partnerCapabilitiesSchema.safeParse({ audience: "partner", available: true }).success,
    ).toBe(false);
  });
});
