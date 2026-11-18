import { createZodDto } from "nestjs-zod";
import { reviewPageSchema, reviewSchema, reviewSummarySchema } from "@hotel-booking/contracts";

/** `GET /api/v1/hotels/:hotelId/reviews` and `GET /api/v1/admin/reviews`. */
export class ReviewPageDto extends createZodDto(reviewPageSchema) {}

/** `POST /api/v1/bookings/:bookingId/reviews`. */
export class ReviewDto extends createZodDto(reviewSchema) {}

/** `GET /api/v1/hotels/:hotelId/rating`. */
export class ReviewSummaryDto extends createZodDto(reviewSummarySchema) {}
