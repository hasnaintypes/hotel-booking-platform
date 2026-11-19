import { z } from "zod";
import { cursorPageSchema } from "./pagination";
import { isoDateTimeSchema, uuidSchema } from "./primitives";

const ratingSchema = z.number().int().min(1).max(5);

export const reviewCategoriesSchema = z.object({
  cleanliness: ratingSchema,
  service: ratingSchema,
  location: ratingSchema,
  value: ratingSchema,
  amenities: ratingSchema,
});

/** One review as the public hotel page and the admin list return it. */
export const reviewSchema = z.object({
  _id: uuidSchema,
  userId: uuidSchema,
  hotelId: uuidSchema,
  bookingId: uuidSchema,
  rating: ratingSchema,
  comment: z.string(),
  categories: reviewCategoriesSchema,
  isVerified: z.boolean(),
  helpfulCount: z.number().int(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const reviewPageSchema = cursorPageSchema(reviewSchema);

/** `GET /api/v1/hotels/:hotelId/rating`. */
export const reviewSummarySchema = z.object({
  hotelId: uuidSchema,
  averageRating: z.number(),
  reviewCount: z.number().int(),
});

export type Review = z.infer<typeof reviewSchema>;
export type ReviewPage = z.infer<typeof reviewPageSchema>;
export type ReviewSummary = z.infer<typeof reviewSummarySchema>;

/** `POST /api/v1/bookings/:bookingId/reviews`: the guest rates their own stay. */
export const createBookingReviewRequestSchema = z.object({
  hotelId: uuidSchema,
  rating: ratingSchema,
  comment: z.string().min(3),
  categories: reviewCategoriesSchema,
});

export type CreateBookingReviewRequest = z.infer<typeof createBookingReviewRequestSchema>;
