import { createZodDto } from "nestjs-zod";
import { createBookingReviewRequestSchema } from "@hotel-booking/contracts";

/** `POST /api/v1/bookings/:bookingId/reviews`. */
export class CreateBookingReviewDto extends createZodDto(createBookingReviewRequestSchema) {}
