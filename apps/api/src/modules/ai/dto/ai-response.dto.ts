import { createZodDto } from "nestjs-zod";
import { suggestResponseSchema } from "@hotel-booking/contracts";

/** `POST /api/v1/manage/ai/suggestions`. */
export class SuggestResponseDto extends createZodDto(suggestResponseSchema) {}
