import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { HotelType, UserType } from "@hotel-booking/types";
import {
  ANALYTICS_MODEL,
  BOOKING_MODEL,
  HOTEL_MODEL,
  REVIEW_MODEL,
  USER_MODEL,
} from "../../database/models";
import { IBooking } from "../bookings/schemas/booking.schema";
import { IReview } from "../reviews/schemas/review.schema";
import { IAnalytics } from "./schemas/analytics-snapshot.schema";

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectModel(ANALYTICS_MODEL)
    private readonly analyticsModel: Model<IAnalytics>,
    @InjectModel(HOTEL_MODEL) private readonly hotelModel: Model<HotelType>,
    @InjectModel(USER_MODEL) private readonly userModel: Model<UserType>,
    @InjectModel(BOOKING_MODEL) private readonly bookingModel: Model<IBooking>,
    @InjectModel(REVIEW_MODEL) private readonly reviewModel: Model<IReview>,
  ) {}

  private async buildLiveSnapshot() {
    const [totalHotels, totalUsers, allBookings, reviewAgg] = await Promise.all([
      this.hotelModel.countDocuments(),
      this.userModel.countDocuments(),
      this.bookingModel.find().select("status paymentStatus totalCost hotelId"),
      this.reviewModel.aggregate([{ $group: { _id: null, averageRating: { $avg: "$rating" } } }]),
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

    const destAgg = await this.bookingModel.aggregate([
      { $addFields: { hotelIdObjectId: { $toObjectId: "$hotelId" } } },
      {
        $group: {
          _id: "$hotelIdObjectId",
          bookings: { $sum: 1 },
          revenue: { $sum: "$totalCost" },
        },
      },
      {
        $lookup: {
          from: "hotels",
          localField: "_id",
          foreignField: "_id",
          as: "hotel",
        },
      },
      { $unwind: "$hotel" },
      {
        $group: {
          _id: "$hotel.city",
          bookings: { $sum: "$bookings" },
          revenue: { $sum: "$revenue" },
        },
      },
      { $sort: { bookings: -1 } },
      { $limit: 10 },
    ]);

    const typeAgg = await this.hotelModel.aggregate([
      { $unwind: { path: "$type", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { $ifNull: ["$type", "Unknown"] },
          bookings: { $sum: { $ifNull: ["$totalBookings", 0] } },
          revenue: { $sum: { $ifNull: ["$totalRevenue", 0] } },
        },
      },
      { $sort: { bookings: -1 } },
      { $limit: 10 },
    ]);

    return {
      date: new Date(),
      metrics: {
        totalBookings,
        totalRevenue,
        totalUsers,
        totalHotels,
        averageBookingValue: Math.round(averageBookingValue * 100) / 100,
        conversionRate: 0,
        cancellationRate: Math.round(cancellationRate * 10) / 10,
        averageRating,
      },
      breakdown: {
        byStatus,
        byPaymentStatus,
        byDestination: destAgg.map((destination) => ({
          city: destination._id as string,
          bookings: destination.bookings as number,
          revenue: destination.revenue as number,
        })),
        byHotelType: typeAgg.map((type) => ({
          type: type._id as string,
          bookings: type.bookings as number,
          revenue: type.revenue as number,
        })),
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
