import { Injectable } from "@nestjs/common";
import {
  BookingsRepository,
  type OwnerBookingCounts,
} from "../../database/repositories/bookings.repository";
import { ReviewsRepository } from "../../database/repositories/reviews.repository";
import type { HotelStats } from "./hotel-response";

export type { OwnerBookingCounts } from "../../database/repositories/bookings.repository";

const emptyStats = (): HotelStats => ({
  totalBookings: 0,
  totalRevenue: 0,
  averageRating: 0,
  reviewCount: 0,
});

@Injectable()
export class HotelStatsService {
  constructor(
    private readonly bookings: BookingsRepository,
    private readonly reviews: ReviewsRepository,
  ) {}

  async forHotels(hotelIds: string[]): Promise<Map<string, HotelStats>> {
    const ids = [...new Set(hotelIds)];
    const result = new Map<string, HotelStats>();
    if (ids.length === 0) return result;

    const [bookingStats, reviewStats] = await Promise.all([
      this.bookings.statsForHotels(ids),
      this.reviews.summaryForHotels(ids),
    ]);

    for (const id of ids) {
      const bookings = bookingStats.get(id);
      const reviews = reviewStats.get(id);
      result.set(id, {
        totalBookings: bookings?.totalBookings ?? 0,
        totalRevenue: bookings?.totalRevenue ?? 0,
        averageRating: reviews?.averageRating ?? 0,
        reviewCount: reviews?.reviewCount ?? 0,
      });
    }

    return result;
  }

  async forHotel(hotelId: string): Promise<HotelStats> {
    const stats = await this.forHotels([hotelId]);
    return stats.get(hotelId) ?? emptyStats();
  }

  async ownerBookingCounts(hotelIds: string[]): Promise<Map<string, OwnerBookingCounts>> {
    return this.bookings.ownerCountsForHotels(hotelIds);
  }
}
