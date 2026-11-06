import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { BookingsRepository } from "../../database/repositories/bookings.repository";
import { HotelsRepository } from "../../database/repositories/hotels.repository";
import { ReviewsRepository } from "../../database/repositories/reviews.repository";
import { CreateBookingReviewDto } from "./dto/create-booking-review.dto";
import { toReviewResponse } from "./review-response";

type CreateReviewInput = CreateBookingReviewDto & { bookingId: string };

@Injectable()
export class ReviewsService {
  constructor(
    private readonly reviews: ReviewsRepository,
    private readonly hotels: HotelsRepository,
    private readonly bookings: BookingsRepository,
  ) {}

  async listAdmin(limit?: string) {
    const parsed = Number.parseInt(String(limit ?? "100"), 10);
    const rows = await this.reviews.listAdmin(parsed);
    return rows.map(toReviewResponse);
  }

  async byHotel(hotelId: string) {
    const rows = await this.reviews.listByHotel(hotelId);
    return rows.map(toReviewResponse);
  }

  async summary(hotelId: string) {
    const summary = await this.reviews.summary(hotelId);
    return { hotelId, ...summary };
  }

  async create(dto: CreateReviewInput, userId: string) {
    const hotel = await this.hotels.findById(dto.hotelId);
    if (!hotel) {
      throw new NotFoundException("Hotel not found");
    }

    const booking = await this.bookings.findById(dto.bookingId);
    if (
      !booking ||
      booking.booking.ownerUserId !== userId ||
      booking.booking.hotelId !== dto.hotelId
    ) {
      throw new ForbiddenException("Booking not found for this user/hotel");
    }

    const review = await this.reviews.create({
      userId,
      hotelId: dto.hotelId,
      bookingId: dto.bookingId,
      rating: dto.rating,
      comment: dto.comment,
      cleanliness: dto.categories.cleanliness,
      service: dto.categories.service,
      location: dto.categories.location,
      value: dto.categories.value,
      amenities: dto.categories.amenities,
      isVerified: booking.payments.find((payment) => !payment.originalPaymentId)?.status === "paid",
    });

    return toReviewResponse(review);
  }
}
