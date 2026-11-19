import { createZodDto } from "nestjs-zod";
import { createBookingRequestSchema } from "@hotel-booking/contracts";

/**
 * `POST /api/v1/bookings`. The body describes the stay only: the server prices it from the hotel's
 * own rate and creates the PaymentIntent from that quote, so money fields are stripped if a client
 * still sends them.
 */
export class CreateBookingDto extends createZodDto(createBookingRequestSchema) {}
