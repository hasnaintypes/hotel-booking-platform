import { Injectable } from "@nestjs/common";
import { AnalyticsRepository } from "../../database/repositories/analytics.repository";
import { HotelsRepository } from "../../database/repositories/hotels.repository";

const round2 = (value: number) => Math.round((value || 0) * 100) / 100;
const toPounds = (minor: number) => round2(minor / 100);

@Injectable()
export class BusinessInsightsService {
  constructor(
    private readonly analytics: AnalyticsRepository,
    private readonly hotels: HotelsRepository,
  ) {}

  async getDashboardData() {
    const now = new Date();
    const [
      overview,
      destinationRows,
      dailyBookings,
      performanceRows,
      bookingStatus,
      paymentStatus,
      reviewStats,
      hotelsByStar,
    ] = await Promise.all([
      this.analytics.overview(),
      this.analytics.popularDestinations(5),
      this.analytics.dailyBookings(7),
      this.analytics.hotelPerformance(10),
      this.analytics.bookingStatusBreakdown(),
      this.analytics.paymentStatusBreakdown(),
      this.analytics.reviewAnalytics(),
      this.hotels.starCounts(),
    ]);

    const currentMonthRevenue = toPounds(overview.currentMonthRevenueMinor);
    const previousMonthRevenue = toPounds(overview.previousMonthRevenueMinor);
    let revenueGrowth = 0;
    if (previousMonthRevenue > 0) {
      revenueGrowth = ((currentMonthRevenue - previousMonthRevenue) / previousMonthRevenue) * 100;
    }

    const totalRevenue = toPounds(overview.totalRevenueMinor);
    const cancellationRate =
      overview.totalBookings > 0
        ? Math.round((overview.cancelledBookings / overview.totalBookings) * 10000) / 100
        : 0;

    const popularDestinations = destinationRows.map((destination) => ({
      _id: destination.city,
      count: destination.count,
      totalRevenue: toPounds(destination.revenueMinor),
      avgPrice: toPounds(destination.averagePriceMinor),
    }));

    const hotelPerformance = performanceRows.map((hotel) => ({
      _id: hotel.id,
      name: hotel.name,
      city: hotel.city,
      starRating: hotel.starRating,
      pricePerNight: toPounds(hotel.pricePerNightMinor),
      bookingCount: hotel.bookingCount,
      totalRevenue: toPounds(hotel.totalRevenueMinor),
    }));

    const statusBreakdown = (counts: Record<string, number>) =>
      Object.entries(counts)
        .filter(([, count]) => count > 0)
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count);

    return {
      overview: {
        totalHotels: overview.totalHotels,
        totalUsers: overview.totalUsers,
        totalBookings: overview.totalBookings,
        recentBookings: overview.recentBookings,
        totalRevenue,
        recentRevenue: toPounds(overview.recentRevenueMinor),
        revenueGrowth: round2(revenueGrowth),
        cancelledBookings: overview.cancelledBookings,
        confirmedBookings: overview.confirmedBookings,
        pendingBookings: overview.pendingBookings,
        refundedBookings: overview.refundedBookings,
        totalRefundAmount: toPounds(overview.totalRefundMinor),
        cancellationRate,
        totalReviews: reviewStats.totalReviews,
        avgReviewRating: round2(reviewStats.averageRating),
        avgLos:
          overview.totalBookings > 0 ? round2(overview.totalNights / overview.totalBookings) : 0,
        adr: overview.totalNights > 0 ? round2(totalRevenue / overview.totalNights) : 0,
        avgPartySize:
          overview.totalBookings > 0
            ? round2((overview.totalAdults + overview.totalChildren) / overview.totalBookings)
            : 0,
        verifiedReviewCount: reviewStats.verifiedReviewCount,
      },
      popularDestinations,
      dailyBookings,
      hotelPerformance,
      bookingStatusBreakdown: statusBreakdown(bookingStatus),
      paymentStatusBreakdown: statusBreakdown(paymentStatus),
      guestMix: { adults: overview.totalAdults, children: overview.totalChildren },
      reviewCategoryAverages: {
        cleanliness: round2(reviewStats.categories.cleanliness),
        service: round2(reviewStats.categories.service),
        location: round2(reviewStats.categories.location),
        value: round2(reviewStats.categories.value),
        amenities: round2(reviewStats.categories.amenities),
      },
      hotelsByStar,
      lastUpdated: now.toISOString(),
    };
  }

  async getForecastData() {
    const now = new Date();
    const [weeklyRows, overview] = await Promise.all([
      this.analytics.weeklyTotals(60),
      this.analytics.overview(),
    ]);

    const weeklyData = weeklyRows.map((week) => ({
      week: week.week,
      bookings: week.bookings,
      revenue: toPounds(week.revenueMinor),
    }));

    const calculateTrend = (data: number[]) => {
      const n = data.length;
      const sumX = (n * (n - 1)) / 2;
      const sumY = data.reduce((sum, value) => sum + value, 0);
      const sumXY = data.reduce((sum, value, index) => sum + value * index, 0);
      const sumXX = (n * (n - 1) * (2 * n - 1)) / 6;
      const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;
      return { slope, intercept };
    };

    const bookingTrends = calculateTrend(weeklyData.map((data) => data.bookings));
    const revenueTrends = calculateTrend(weeklyData.map((data) => data.revenue));

    const forecasts = [];
    for (let i = 1; i <= 4; i++) {
      const weekIndex = weeklyData.length + i - 1;
      let forecastedBookings = 0;
      let forecastedRevenue = 0;
      if (weeklyData.length > 1) {
        forecastedBookings = Math.max(
          0,
          Math.round(bookingTrends.slope * weekIndex + bookingTrends.intercept),
        );
        forecastedRevenue = Math.max(0, revenueTrends.slope * weekIndex + revenueTrends.intercept);
      } else if (weeklyData.length === 1) {
        const baseWeek = weeklyData[0];
        forecastedBookings = Math.max(1, Math.round(baseWeek.bookings * (0.9 + i * 0.1)));
        forecastedRevenue = Math.max(100, Math.round(baseWeek.revenue * (0.9 + i * 0.1)));
      }
      const forecastDate = new Date(now.getTime() + i * 7 * 24 * 60 * 60 * 1000);
      forecasts.push({
        week: forecastDate.toISOString().split("T")[0],
        bookings: forecastedBookings,
        revenue: round2(forecastedRevenue),
        confidence: Math.max(0.6, 1 - i * 0.1),
      });
    }

    let seasonalGrowth = 0;
    if (overview.previousMonthBookings > 0) {
      seasonalGrowth =
        ((overview.currentMonthBookings - overview.previousMonthBookings) /
          overview.previousMonthBookings) *
        100;
    }

    return {
      historical: weeklyData,
      forecasts,
      seasonalGrowth: round2(seasonalGrowth),
      trends: {
        bookingTrend:
          weeklyData.length > 1
            ? bookingTrends.slope > 0
              ? "increasing"
              : "decreasing"
            : "stable",
        revenueTrend:
          weeklyData.length > 1
            ? revenueTrends.slope > 0
              ? "increasing"
              : "decreasing"
            : "stable",
      },
      lastUpdated: now.toISOString(),
    };
  }

  async getBusinessStatsData() {
    const [overview, totalHotels] = await Promise.all([
      this.analytics.overview(),
      this.hotels.count(),
    ]);

    return {
      database: {
        totalHotels,
        totalBookings: overview.totalBookings,
        totalRevenue: toPounds(overview.totalRevenueMinor),
      },
      application: {
        todayBookings: overview.todayBookings,
        thisWeekBookings: overview.weekBookings,
      },
      lastUpdated: new Date().toISOString(),
    };
  }

  async getSystemStatsData() {
    const memUsage = process.memoryUsage();
    const used = Math.round(memUsage.heapUsed / 1024 / 1024);
    const total = Math.round(memUsage.heapTotal / 1024 / 1024);
    const business = await this.getBusinessStatsData();

    return {
      ...business,
      system: {
        memory: {
          used,
          total,
          percentage: total > 0 ? Math.round((used / total) * 100) : 0,
        },
        uptime: Math.round(process.uptime()),
      },
    };
  }
}
