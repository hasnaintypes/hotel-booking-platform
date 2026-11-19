import { createZodDto } from "nestjs-zod";
import { adminCancelBookingRequestSchema } from "@hotel-booking/contracts";

/**
 * Admin cancellation. Unlike the guest route, the operator must write why they cancelled: the
 * reason lands on the `cancelling` event beside the actor, permission and request id.
 */
export class AdminCancelBookingDto extends createZodDto(adminCancelBookingRequestSchema) {}
