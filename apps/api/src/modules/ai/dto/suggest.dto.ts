import { createZodDto } from "nestjs-zod";
import { suggestRequestSchema } from "@hotel-booking/contracts";

/** `POST /api/v1/manage/ai/suggestions`. */
export class SuggestDto extends createZodDto(suggestRequestSchema) {}
