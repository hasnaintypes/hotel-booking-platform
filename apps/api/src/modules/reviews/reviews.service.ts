import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { CursorPage } from "@hotel-booking/contracts";
import { BookingsRepository } from "../../database/repositories/bookings.repository";
import { HotelsRepository } from "../../database/repositories/hotels.repository";
import { pageOf, pageSize } from "../../common/pagination/cursor-page";
import { readTimestampCursor } from "../../common/pagination/sorted-cursor";
import {
  ReviewsRepository,
  type ReviewRecord,
} from "../../database/repositories/reviews.repository";
import type {
  AdminReviewListQueryDto,
  HotelReviewListQueryDto,
} from "./dto/list-reviews-query.dto";
import { CreateBookingReviewDto } from "./dto/create-booking-review.dto";
import { toReviewResponse, type ReviewResponse } from "./review-response";

/** Cursor scopes: a tag minted for one review list is rejected by the others. */
const ADMIN_REVIEW_SCOPE = "reviews:admin";
const HOTEL_REVIEW_SCOPE = "reviews:hotel";

type CreateReviewInput = CreateBookingReviewDto & { bookingId: string };

/** One cursor page of reviews, positioned by each row's exact stored timestamp. */
const reviewPage = (
  rows: Array<ReviewRecord & { cursorKey: string }>,
  limit: number,
  scope: string,
): CursorPage<ReviewResponse> => {
  const page = pageOf(rows, limit, scope, (row) => ({ key: row.cursorKey, id: row.id }));
  return { data: page.data.map(toReviewResponse), pageInfo: page.pageInfo };
};

@Injectable()
export class ReviewsService {
  constructor(
    private readonly reviews: ReviewsRepository,
    private readonly hotels: HotelsRepository,
    private readonly bookings: BookingsRepository,
  ) {}

  async listAdmin(query: AdminReviewListQueryDto): Promise<CursorPage<ReviewResponse>> {
    const limit = pageSize(query);
    const rows = await this.reviews.listPage(
      { hotelId: query.hotelId, rating: query.rating },
      { limit, cursor: readTimestampCursor(query.cursor, ADMIN_REVIEW_SCOPE) },
    );
    return reviewPage(rows, limit, ADMIN_REVIEW_SCOPE);
  }

  async byHotel(
    hotelId: string,
    query: HotelReviewListQueryDto,
  ): Promise<CursorPage<ReviewResponse>> {
    const limit = pageSize(query);
    const rows = await this.reviews.listByHotelPage(hotelId, {
      limit,
      cursor: readTimestampCursor(query.cursor, HOTEL_REVIEW_SCOPE),
    });
    return reviewPage(rows, limit, HOTEL_REVIEW_SCOPE);
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
