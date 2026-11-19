import { createZodDto } from "nestjs-zod";
import { updateDiscrepancyRequestSchema } from "@hotel-booking/contracts";

/**
 * Assignment and closure in one patch. `assignedToUserId: null` clears the owner; closing a
 * finding needs a resolution, and a closed finding cannot be reopened.
 */
export class UpdateDiscrepancyDto extends createZodDto(updateDiscrepancyRequestSchema) {}
