import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { BOOKING_MODEL, REVIEW_MODEL } from "../../database/models";
import { IBooking } from "../bookings/schemas/booking.schema";
import { IReview } from "../reviews/schemas/review.schema";
import type { HotelStats } from "./hotel-response";

export type OwnerBookingCounts = {
  upcomingBookings: number;
  completedBookings: number;
  cancelledBookings: number;
};

const classify = (
  bookings: Array<{ status?: string; checkIn: Date; checkOut: Date }>,
): OwnerBookingCounts => {
  const now = Date.now();
  let upcoming = 0;
  let completed = 0;
  let cancelled = 0;

  for (const booking of bookings) {
    if (booking.status === "cancelled" || booking.status === "refunded") {
      cancelled += 1;
    } else if (booking.status === "completed" || new Date(booking.checkOut).getTime() < now) {
      completed += 1;
    } else {
      upcoming += 1;
    }
  }

  return {
    upcomingBookings: upcoming,
    completedBookings: completed,
    cancelledBookings: cancelled,
  };
};

@Injectable()
export class HotelStatsService {
  constructor(
    @InjectModel(BOOKING_MODEL) private readonly bookingModel: Model<IBooking>,
    @InjectModel(REVIEW_MODEL) private readonly reviewModel: Model<IReview>,
  ) {}

  async forHotels(hotelIds: string[]): Promise<Map<string, HotelStats>> {
    const ids = [...new Set(hotelIds)];
    const result = new Map<string, HotelStats>();
    if (ids.length === 0) return result;

    const [bookingRows, reviewRows] = await Promise.all([
      this.bookingModel.aggregate<{
        _id: string;
        totalBookings: number;
        totalRevenue: number;
      }>([
        { $match: { hotelId: { $in: ids }, status: { $nin: ["cancelled", "refunded"] } } },
        {
          $group: {
            _id: "$hotelId",
            totalBookings: { $sum: 1 },
            totalRevenue: { $sum: "$totalCost" },
          },
        },
      ]),
      this.reviewModel.aggregate<{
        _id: string;
        averageRating: number;
        reviewCount: number;
      }>([
        { $match: { hotelId: { $in: ids } } },
        {
          $group: {
            _id: "$hotelId",
            averageRating: { $avg: "$rating" },
            reviewCount: { $sum: 1 },
          },
        },
      ]),
    ]);

    for (const id of ids) {
      result.set(id, {
        totalBookings: 0,
        totalRevenue: 0,
        averageRating: 0,
        reviewCount: 0,
      });
    }

    for (const row of bookingRows) {
      const current = result.get(row._id);
      if (!current) continue;
      current.totalBookings = Number(row.totalBookings) || 0;
      current.totalRevenue = Number(row.totalRevenue) || 0;
    }

    for (const row of reviewRows) {
      const current = result.get(row._id);
      if (!current) continue;
      current.averageRating = Math.round((Number(row.averageRating) || 0) * 10) / 10;
      current.reviewCount = Number(row.reviewCount) || 0;
    }

    return result;
  }

  async forHotel(hotelId: string): Promise<HotelStats> {
    const stats = await this.forHotels([hotelId]);
    return (
      stats.get(hotelId) ?? {
        totalBookings: 0,
        totalRevenue: 0,
        averageRating: 0,
        reviewCount: 0,
      }
    );
  }

  async ownerBookingCounts(hotelIds: string[]): Promise<Map<string, OwnerBookingCounts>> {
    const ids = [...new Set(hotelIds)];
    const result = new Map<string, OwnerBookingCounts>();
    if (ids.length === 0) return result;

    const bookings = await this.bookingModel
      .find({ hotelId: { $in: ids } })
      .select("hotelId status checkIn checkOut")
      .lean();

    const byHotel = new Map<string, Array<{ status?: string; checkIn: Date; checkOut: Date }>>();
    for (const booking of bookings) {
      const list = byHotel.get(booking.hotelId) ?? [];
      list.push(booking);
      byHotel.set(booking.hotelId, list);
    }

    for (const id of ids) {
      result.set(id, classify(byHotel.get(id) ?? []));
    }
    return result;
  }
}
