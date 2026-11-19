import { createZodDto } from "nestjs-zod";
import { removeHotelImageRequestSchema } from "@hotel-booking/contracts";

/** `DELETE /api/v1/manage/hotels/:id/images`: the stored URL to forget. */
export class RemoveHotelImageDto extends createZodDto(removeHotelImageRequestSchema) {}
