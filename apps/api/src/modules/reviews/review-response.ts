import type { ReviewRecord } from "../../database/repositories/reviews.repository";

export type ReviewResponse = {
  _id: string;
  userId: string;
  hotelId: string;
  bookingId: string;
  rating: number;
  comment: string;
  categories: {
    cleanliness: number;
    service: number;
    location: number;
    value: number;
    amenities: number;
  };
  isVerified: boolean;
  helpfulCount: number;
  createdAt: Date;
  updatedAt: Date;
};

/** Maps the PostgreSQL review row to the shape the existing SPAs consume. */
export function toReviewResponse(review: ReviewRecord): ReviewResponse {
  return {
    _id: review.id,
    userId: review.userId,
    hotelId: review.hotelId,
    bookingId: review.bookingId,
    rating: review.rating,
    comment: review.comment,
    categories: {
      cleanliness: review.cleanliness,
      service: review.service,
      location: review.location,
      value: review.value,
      amenities: review.amenities,
    },
    isVerified: review.isVerified,
    helpfulCount: review.helpfulCount,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  };
}
