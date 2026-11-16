import { createZodDto } from "nestjs-zod";
import {
  adminHotelListQuerySchema,
  hotelSearchQuerySchema,
  myHotelListQuerySchema,
  publicHotelListQuerySchema,
  publicHotelPageSchema,
  publicHotelSchema,
} from "@hotel-booking/contracts";

/** `GET /api/v1/hotels/search` query parameters, validated by the shared contract. */
export class HotelSearchQueryDto extends createZodDto(hotelSearchQuerySchema) {}

/** `GET /api/v1/hotels/search` and `GET /api/v1/hotels` responses. */
export class PublicHotelPageDto extends createZodDto(publicHotelPageSchema) {}

/** `GET /api/v1/hotels` query parameters. */
export class PublicHotelListQueryDto extends createZodDto(publicHotelListQuerySchema) {}

/** `GET /api/v1/admin/hotels` query parameters. */
export class AdminHotelListQueryDto extends createZodDto(adminHotelListQuerySchema) {}

/** `GET /api/v1/manage/hotels` query parameters. */
export class MyHotelListQueryDto extends createZodDto(myHotelListQuerySchema) {}

export class PublicHotelDto extends createZodDto(publicHotelSchema) {}
