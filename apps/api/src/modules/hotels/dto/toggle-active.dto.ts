import { createZodDto } from "nestjs-zod";
import { toggleActiveRequestSchema } from "@hotel-booking/contracts";

/** `PATCH /api/v1/manage/hotels/:id/active` and `PATCH /api/v1/admin/hotels/:id`. */
export class ToggleActiveDto extends createZodDto(toggleActiveRequestSchema) {}
