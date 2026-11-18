import { createZodDto } from "nestjs-zod";
import {
  adminHotelPageSchema,
  adminHotelSchema,
  hotelStatsSchema,
  manageHotelPageSchema,
  manageHotelSchema,
} from "@hotel-booking/contracts";

/** One owner hotel as the manage detail, create and update routes return it. */
export class ManageHotelDto extends createZodDto(manageHotelSchema) {}

/** `GET /api/v1/manage/hotels` — the owner's page, with the dashboard counters. */
export class ManageHotelPageDto extends createZodDto(manageHotelPageSchema) {}

/** One hotel as the admin queue and detail routes return it. */
export class AdminHotelDto extends createZodDto(adminHotelSchema) {}

/** `GET /api/v1/admin/hotels` — one page of every listing. */
export class AdminHotelPageDto extends createZodDto(adminHotelPageSchema) {}

/** `GET /api/v1/manage/hotels/:id/stats`. */
export class HotelStatsDto extends createZodDto(hotelStatsSchema) {}
