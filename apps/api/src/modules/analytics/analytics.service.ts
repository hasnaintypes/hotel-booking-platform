import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { ANALYTICS_MODEL, BOOKING_MODEL, REVIEW_MODEL } from "../../database/models";
import { HotelsRepository } from "../../database/repositories/hotels.repository";
import { UsersRepository } from "../../database/repositories/users.repository";
import { IBooking } from "../bookings/schemas/booking.schema";
import { IReview } from "../reviews/schemas/review.schema";
import { IAnalytics } from "./schemas/analytics-snapshot.schema";

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectModel(ANALYTICS_MODEL)
    private readonly analyticsModel: Model<IAnalytics>,
    private readonly hotels: HotelsRepository,
    private readonly users: UsersRepository,
    @InjectModel(BOOKING_MODEL) private readonly bookingModel: Model<IBooking>,
    @InjectModel(REVIEW_MODEL) private readonly reviewModel: Model<IReview>,
  ) {}

  private async buildLiveSnapshot() {
    const [totalHotels, totalUsers, allBookings, reviewAgg, bookingTotals] = await Promise.all([
      this.hotels.count(),
      this.users.count(),
      this.bookingModel.find().select("status paymentStatus totalCost hotelId"),
      this.reviewModel.aggregate([{ $group: { _id: null, averageRating: { $avg: "$rating" } } }]),
      this.bookingModel.aggregate<{
        _id: string;
        bookings: number;
        revenue: number;
      }>([
        {
          $group: {
            _id: "$hotelId",
            bookings: { $sum: 1 },
            revenue: { $sum: "$totalCost" },
          },
        },
      ]),
    ]);

    const totalBookings = allBookings.length;
    const totalRevenue = allBookings.reduce((sum, booking) => sum + (booking.totalCost || 0), 0);

    const byStatus = {
      pending: 0,
      confirmed: 0,
      cancelled: 0,
      completed: 0,
      refunded: 0,
    };
    const byPaymentStatus = {
      pending: 0,
      paid: 0,
      failed: 0,
      refunded: 0,
    };

    for (const booking of allBookings) {
      const status = (booking.status || "pending") as keyof typeof byStatus;
      if (status in byStatus) byStatus[status] += 1;
      const payment = (booking.paymentStatus || "pending") as keyof typeof byPaymentStatus;
      if (payment in byPaymentStatus) byPaymentStatus[payment] += 1;
    }

    const cancelledCount = byStatus.cancelled + byStatus.refunded;
    const cancellationRate = totalBookings > 0 ? (cancelledCount / totalBookings) * 100 : 0;
    const averageBookingValue = totalBookings > 0 ? totalRevenue / totalBookings : 0;
    const averageRating = reviewAgg[0]?.averageRating
      ? Math.round((reviewAgg[0].averageRating as number) * 10) / 10
      : 0;

    const hotelRows = await this.hotels.findByIds(bookingTotals.map((total) => String(total._id)));
    const hotelsById = new Map(hotelRows.map((hotel) => [hotel.id, hotel]));

    const destinations = new Map<string, { bookings: number; revenue: number }>();
    for (const total of bookingTotals) {
      const hotel = hotelsById.get(String(total._id));
      if (!hotel) continue;
      const destination = destinations.get(hotel.city) ?? { bookings: 0, revenue: 0 };
      destination.bookings += Number(total.bookings) || 0;
      destination.revenue += Number(total.revenue) || 0;
      destinations.set(hotel.city, destination);
    }

    const bookingTotalsById = new Map(
      bookingTotals.map((total) => [
        String(total._id),
        { bookings: Number(total.bookings) || 0, revenue: Number(total.revenue) || 0 },
      ]),
    );
    const types = new Map<string, { bookings: number; revenue: number }>();
    for (const hotel of hotelRows) {
      const totals = bookingTotalsById.get(hotel.id) ?? { bookings: 0, revenue: 0 };
      for (const type of hotel.types.length > 0 ? hotel.types : ["Unknown"]) {
        const current = types.get(type) ?? { bookings: 0, revenue: 0 };
        current.bookings += totals.bookings;
        current.revenue += totals.revenue;
        types.set(type, current);
      }
    }

    return {
      date: new Date(),
      metrics: {
        totalBookings,
        totalRevenue,
        totalUsers,
        totalHotels,
        averageBookingValue: Math.round(averageBookingValue * 100) / 100,
        cancellationRate: Math.round(cancellationRate * 10) / 10,
        averageRating,
      },
      breakdown: {
        byStatus,
        byPaymentStatus,
        byDestination: [...destinations]
          .map(([city, totals]) => ({ city, ...totals }))
          .sort((a, b) => b.bookings - a.bookings)
          .slice(0, 10),
        byHotelType: [...types]
          .map(([type, totals]) => ({ type, ...totals }))
          .sort((a, b) => b.bookings - a.bookings)
          .slice(0, 10),
      },
    };
  }

  findRollups(limit?: string) {
    const parsed = Math.min(parseInt(String(limit || "20"), 10), 50);
    return this.analyticsModel.find().sort({ date: -1 }).limit(parsed);
  }

  async createRollup() {
    const payload = await this.buildLiveSnapshot();
    return this.analyticsModel.create(payload);
  }
}
