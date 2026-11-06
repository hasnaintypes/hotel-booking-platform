import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { BOOKING_MODEL, REVIEW_MODEL } from "../../database/models";
import { HotelsRepository } from "../../database/repositories/hotels.repository";
import { UsersRepository } from "../../database/repositories/users.repository";
import { IBooking } from "../bookings/schemas/booking.schema";
import { IReview } from "../reviews/schemas/review.schema";

const round2 = (value: number) => Math.round((value || 0) * 100) / 100;

@Injectable()
export class BusinessInsightsService {
  constructor(
    private readonly hotels: HotelsRepository,
    private readonly users: UsersRepository,
    @InjectModel(BOOKING_MODEL) private readonly bookingModel: Model<IBooking>,
    @InjectModel(REVIEW_MODEL) private readonly reviewModel: Model<IReview>,
  ) {}

  async getDashboardData() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const totalHotels = await this.hotels.count();
    const totalUsers = await this.users.count();
    const allBookings = await this.bookingModel.find();
    const totalBookings = allBookings.length;

    const recentBookings = allBookings.filter(
      (booking) => new Date(booking.createdAt) >= thirtyDaysAgo,
    ).length;

    const totalRevenue = allBookings.reduce((sum, booking) => sum + (booking.totalCost || 0), 0);

    const recentRevenue = allBookings
      .filter((booking) => new Date(booking.createdAt) >= thirtyDaysAgo)
      .reduce((sum, booking) => sum + (booking.totalCost || 0), 0);

    const currentMonthRevenue = allBookings
      .filter((booking) => {
        const bookingDate = new Date(booking.createdAt);
        return bookingDate >= new Date(now.getFullYear(), now.getMonth(), 1);
      })
      .reduce((sum, booking) => sum + (booking.totalCost || 0), 0);

    const previousMonthRevenue = allBookings
      .filter((booking) => {
        const bookingDate = new Date(booking.createdAt);
        return (
          bookingDate >= new Date(now.getFullYear(), now.getMonth() - 1, 1) &&
          bookingDate < new Date(now.getFullYear(), now.getMonth(), 1)
        );
      })
      .reduce((sum, booking) => sum + (booking.totalCost || 0), 0);

    let revenueGrowth = 0;
    if (previousMonthRevenue > 0) {
      revenueGrowth = ((currentMonthRevenue - previousMonthRevenue) / previousMonthRevenue) * 100;
    } else if (currentMonthRevenue > 0) {
      revenueGrowth = 0;
    }

    const destinationTotals = await this.bookingModel.aggregate<{
      _id: string;
      count: number;
      totalRevenue: number;
    }>([
      {
        $group: {
          _id: "$hotelId",
          count: { $sum: 1 },
          totalRevenue: { $sum: "$totalCost" },
        },
      },
    ]);

    const destinationHotels = await this.hotels.findByIds(
      destinationTotals.map((total) => String(total._id)),
    );
    const destinationHotelById = new Map(destinationHotels.map((hotel) => [hotel.id, hotel]));
    const destinationMap = new Map<
      string,
      { _id: string; count: number; totalRevenue: number; priceTotal: number; hotels: number }
    >();
    for (const total of destinationTotals) {
      const hotel = destinationHotelById.get(String(total._id));
      if (!hotel) continue;
      const current = destinationMap.get(hotel.city) ?? {
        _id: hotel.city,
        count: 0,
        totalRevenue: 0,
        priceTotal: 0,
        hotels: 0,
      };
      current.count += Number(total.count) || 0;
      current.totalRevenue += Number(total.totalRevenue) || 0;
      current.priceTotal += hotel.pricePerNightMinor / 100;
      current.hotels += 1;
      destinationMap.set(hotel.city, current);
    }

    const popularDestinations = [...destinationMap.values()]
      .map((destination) => ({
        _id: destination._id,
        count: destination.count,
        totalRevenue: destination.totalRevenue,
        avgPrice: destination.hotels > 0 ? destination.priceTotal / destination.hotels : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    if (popularDestinations.length === 0) {
      const hotelRows = await this.hotels.listForMetrics();
      const hotelDestinations = hotelRows.reduce(
        (acc, hotel) => {
          const current = acc[hotel.city] ?? {
            _id: hotel.city,
            count: 0,
            totalRevenue: 0,
            priceTotal: 0,
            hotels: 0,
          };
          current.count += 1;
          current.priceTotal += hotel.pricePerNightMinor / 100;
          current.hotels += 1;
          acc[hotel.city] = current;
          return acc;
        },
        {} as Record<
          string,
          {
            _id: string;
            count: number;
            totalRevenue: number;
            priceTotal: number;
            hotels: number;
          }
        >,
      );
      popularDestinations.push(
        ...Object.values(hotelDestinations)
          .map((destination) => ({
            _id: destination._id,
            count: destination.count,
            totalRevenue: destination.totalRevenue,
            avgPrice: destination.hotels > 0 ? destination.priceTotal / destination.hotels : 0,
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5),
      );
    }

    const bookingDates = allBookings.reduce((acc: any, booking) => {
      if (booking.createdAt) {
        const dateKey = new Date(booking.createdAt).toISOString().split("T")[0];
        acc[dateKey] = (acc[dateKey] || 0) + 1;
      }
      return acc;
    }, {});

    let dailyBookings = Object.entries(bookingDates)
      .map(([date, count]) => ({ date, bookings: count as number }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    if (dailyBookings.length > 7) dailyBookings = dailyBookings.slice(-7);

    const performanceTotals = await this.bookingModel.aggregate<{
      _id: string;
      bookingCount: number;
      totalRevenue: number;
    }>([
      {
        $group: {
          _id: "$hotelId",
          bookingCount: { $sum: 1 },
          totalRevenue: { $sum: "$totalCost" },
        },
      },
    ]);

    const performanceHotels = await this.hotels.findByIds(
      performanceTotals.map((total) => String(total._id)),
    );
    const performanceHotelById = new Map(performanceHotels.map((hotel) => [hotel.id, hotel]));
    const hotelPerformance = performanceTotals
      .map((total) => {
        const hotel = performanceHotelById.get(String(total._id));
        if (!hotel) return null;
        return {
          _id: hotel.id,
          name: hotel.name,
          city: hotel.city,
          starRating: hotel.starRating,
          pricePerNight: hotel.pricePerNightMinor / 100,
          bookingCount: Number(total.bookingCount) || 0,
          totalRevenue: Number(total.totalRevenue) || 0,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => b.bookingCount - a.bookingCount)
      .slice(0, 10);

    if (hotelPerformance.length === 0) {
      const hotelRows = await this.hotels.findByIds(
        (await this.hotels.listForMetrics()).map((hotel) => hotel.id),
      );
      hotelPerformance.push(
        ...hotelRows
          .map((hotel) => ({
            _id: hotel.id,
            name: hotel.name,
            city: hotel.city,
            starRating: hotel.starRating,
            pricePerNight: hotel.pricePerNightMinor / 100,
            bookingCount: 0,
            totalRevenue: 0,
          }))
          .sort((a, b) => b.bookingCount - a.bookingCount)
          .slice(0, 10),
      );
    }

    const cancelledBookings = allBookings.filter(
      (booking) => booking.status === "cancelled",
    ).length;
    const confirmedBookings = allBookings.filter(
      (booking) => booking.status === "confirmed" || booking.status === "completed",
    ).length;
    const pendingBookings = allBookings.filter((booking) => booking.status === "pending").length;
    const refundedBookings = allBookings.filter(
      (booking) => booking.status === "refunded" || booking.paymentStatus === "refunded",
    ).length;
    const totalRefundAmount = allBookings.reduce(
      (sum, booking) => sum + (Number(booking.refundAmount) || 0),
      0,
    );
    const cancellationRate =
      totalBookings > 0 ? Math.round((cancelledBookings / totalBookings) * 10000) / 100 : 0;

    const totalReviews = await this.reviewModel.countDocuments();
    const verifiedReviewCount = await this.reviewModel.countDocuments({
      isVerified: true,
    });
    const ratingAgg = await this.reviewModel.aggregate([
      {
        $group: {
          _id: null,
          avgRating: { $avg: "$rating" },
          cleanliness: { $avg: "$categories.cleanliness" },
          service: { $avg: "$categories.service" },
          location: { $avg: "$categories.location" },
          value: { $avg: "$categories.value" },
          amenities: { $avg: "$categories.amenities" },
        },
      },
    ]);
    const avgReviewRating =
      ratingAgg.length > 0 ? Math.round((ratingAgg[0].avgRating || 0) * 100) / 100 : 0;
    const reviewCategoryAverages = {
      cleanliness: ratingAgg.length ? round2(ratingAgg[0].cleanliness) : 0,
      service: ratingAgg.length ? round2(ratingAgg[0].service) : 0,
      location: ratingAgg.length ? round2(ratingAgg[0].location) : 0,
      value: ratingAgg.length ? round2(ratingAgg[0].value) : 0,
      amenities: ratingAgg.length ? round2(ratingAgg[0].amenities) : 0,
    };

    const dayMs = 24 * 60 * 60 * 1000;
    let totalNights = 0;
    let totalAdults = 0;
    let totalChildren = 0;
    for (const booking of allBookings) {
      const inMs = new Date(booking.checkIn).getTime();
      const outMs = new Date(booking.checkOut).getTime();
      const nights =
        Number.isFinite(inMs) && Number.isFinite(outMs) && outMs > inMs
          ? Math.max(1, Math.round((outMs - inMs) / dayMs))
          : 1;
      totalNights += nights;
      totalAdults += Number(booking.adultCount) || 0;
      totalChildren += Number(booking.childCount) || 0;
    }
    const avgLos = totalBookings > 0 ? round2(totalNights / totalBookings) : 0;
    const adr = totalNights > 0 ? round2(totalRevenue / totalNights) : 0;
    const avgPartySize =
      totalBookings > 0 ? round2((totalAdults + totalChildren) / totalBookings) : 0;
    const guestMix = { adults: totalAdults, children: totalChildren };

    const countBy = (field: string) => {
      const map: Record<string, number> = {};
      for (const booking of allBookings) {
        const key = String((booking as any)[field] || "unknown");
        map[key] = (map[key] || 0) + 1;
      }
      return Object.entries(map)
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count);
    };
    const bookingStatusBreakdown = countBy("status");
    const paymentStatusBreakdown = countBy("paymentStatus");

    const hotelsByStar = await this.hotels.starCounts();

    return {
      overview: {
        totalHotels,
        totalUsers,
        totalBookings,
        recentBookings,
        totalRevenue: round2(totalRevenue),
        recentRevenue: round2(recentRevenue),
        revenueGrowth: round2(revenueGrowth),
        cancelledBookings,
        confirmedBookings,
        pendingBookings,
        refundedBookings,
        totalRefundAmount: round2(totalRefundAmount),
        cancellationRate,
        totalReviews,
        avgReviewRating,
        avgLos,
        adr,
        avgPartySize,
        verifiedReviewCount,
      },
      popularDestinations,
      dailyBookings,
      hotelPerformance,
      bookingStatusBreakdown,
      paymentStatusBreakdown,
      guestMix,
      reviewCategoryAverages,
      hotelsByStar,
      lastUpdated: now.toISOString(),
    };
  }

  async getForecastData() {
    const now = new Date();
    const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const allBookings = await this.bookingModel.find();
    const historicalBookings = allBookings.filter(
      (booking) => new Date(booking.createdAt) >= twoMonthsAgo,
    );

    const weekGroups = historicalBookings.reduce((acc: any, booking) => {
      const bookingDate = new Date(booking.createdAt);
      const weekStart = new Date(bookingDate);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const weekKey = weekStart.toISOString().split("T")[0];
      if (!acc[weekKey]) acc[weekKey] = { week: weekKey, bookings: 0, revenue: 0 };
      acc[weekKey].bookings++;
      acc[weekKey].revenue += booking.totalCost;
      return acc;
    }, {});

    const weeklyData = Object.values(weekGroups)
      .map((week: any) => ({
        week: week.week,
        bookings: week.bookings,
        revenue: Math.round(week.revenue * 100) / 100,
      }))
      .sort((a: any, b: any) => new Date(a.week).getTime() - new Date(b.week).getTime());

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
        revenue: Math.round(forecastedRevenue * 100) / 100,
        confidence: Math.max(0.6, 1 - i * 0.1),
      });
    }

    const currentMonthBookings = allBookings.filter((booking) => {
      const bookingDate = new Date(booking.createdAt);
      return bookingDate >= new Date(now.getFullYear(), now.getMonth(), 1);
    }).length;
    const lastMonthBookings = allBookings.filter((booking) => {
      const bookingDate = new Date(booking.createdAt);
      return (
        bookingDate >= new Date(now.getFullYear(), now.getMonth() - 1, 1) &&
        bookingDate < new Date(now.getFullYear(), now.getMonth(), 1)
      );
    }).length;
    let seasonalGrowth = 0;
    if (lastMonthBookings > 0) {
      seasonalGrowth = ((currentMonthBookings - lastMonthBookings) / lastMonthBookings) * 100;
    }

    return {
      historical: weeklyData,
      forecasts,
      seasonalGrowth: Math.round(seasonalGrowth * 100) / 100,
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
    const totalHotels = await this.hotels.count();
    const allBookings = await this.bookingModel.find();
    const totalBookings = allBookings.length;
    const totalRevenue = allBookings.reduce((sum, booking) => sum + (booking.totalCost || 0), 0);
    const today = new Date();
    const todayBookings = allBookings.filter(
      (booking) => new Date(booking.createdAt).toDateString() === today.toDateString(),
    ).length;
    const thisWeekBookings = allBookings.filter((booking) => {
      const bookingDate = new Date(booking.createdAt);
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      return bookingDate >= weekAgo;
    }).length;

    // Only figures computed from the database. Request rates, response times and error rates are
    // not measured by the application, so they are not reported.
    return {
      database: {
        totalHotels,
        totalBookings,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
      },
      application: {
        todayBookings,
        thisWeekBookings,
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
