import { createZodDto } from "nestjs-zod";
import { cancelBookingRequestSchema } from "@hotel-booking/contracts";

/** `POST /api/v1/bookings/:id/cancel`: a guest may cancel without writing a reason. */
export class CancelBookingDto extends createZodDto(cancelBookingRequestSchema) {}
