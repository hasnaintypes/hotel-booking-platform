import { createZodDto } from "nestjs-zod";
import { manualBookingActionRequestSchema } from "@hotel-booking/contracts";

/**
 * Manual booking actions always demand a human-written reason: it lands in `booking_events` next
 * to the actor, permission and request id.
 */
export class ManualBookingActionDto extends createZodDto(manualBookingActionRequestSchema) {}
