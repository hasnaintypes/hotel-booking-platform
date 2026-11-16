import { createZodDto } from "nestjs-zod";
import {
  hotelSearchQuerySchema,
  hotelSearchResponseSchema,
  publicHotelSchema,
} from "@hotel-booking/contracts";
import { z } from "zod";

/** `GET /api/v1/hotels/search` query parameters, validated by the shared contract. */
export class HotelSearchQueryDto extends createZodDto(hotelSearchQuerySchema) {}

/** `GET /api/v1/hotels/search` and `GET /api/v1/hotels`. */
export class HotelSearchResponseDto extends createZodDto(hotelSearchResponseSchema) {}

export class PublicHotelListDto extends createZodDto(z.array(publicHotelSchema)) {}

export class PublicHotelDto extends createZodDto(publicHotelSchema) {}
