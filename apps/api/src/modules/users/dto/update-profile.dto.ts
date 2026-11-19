import { createZodDto } from "nestjs-zod";
import { updateProfileRequestSchema } from "@hotel-booking/contracts";

/** `PATCH /api/v1/me`; every field is optional and an absent one is left unchanged. */
export class UpdateProfileDto extends createZodDto(updateProfileRequestSchema) {}
