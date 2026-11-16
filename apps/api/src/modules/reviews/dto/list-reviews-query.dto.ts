import { createZodDto } from "nestjs-zod";
import { adminReviewListQuerySchema, hotelReviewListQuerySchema } from "@hotel-booking/contracts";

/** `GET /api/v1/admin/reviews` — every review, newest first. */
export class AdminReviewListQueryDto extends createZodDto(adminReviewListQuerySchema) {}

/** `GET /api/v1/hotels/:hotelId/reviews` — one hotel's reviews, newest first. */
export class HotelReviewListQueryDto extends createZodDto(hotelReviewListQuerySchema) {}
