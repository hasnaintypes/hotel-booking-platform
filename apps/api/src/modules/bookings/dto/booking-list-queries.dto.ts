import { createZodDto } from "nestjs-zod";
import { hotelBookingListQuerySchema, myBookingListQuerySchema } from "@hotel-booking/contracts";

/** `GET /api/v1/bookings` — the signed-in guest's own bookings, newest first. */
export class MyBookingListQueryDto extends createZodDto(myBookingListQuerySchema) {}

/** `GET /api/v1/manage/hotels/:hotelId/bookings` — one hotel's bookings, newest first. */
export class HotelBookingListQueryDto extends createZodDto(hotelBookingListQuerySchema) {}
