import { createZodDto } from "nestjs-zod";
import { hotelFormRequestSchema } from "@hotel-booking/contracts";

/**
 * The fields an owner may set when creating or editing a hotel. Anything else in the request
 * (isFeatured, totalRevenue, averageRating, isActive, userId, ...) is stripped and can never reach
 * the database.
 */
export class HotelFormDto extends createZodDto(hotelFormRequestSchema) {}
