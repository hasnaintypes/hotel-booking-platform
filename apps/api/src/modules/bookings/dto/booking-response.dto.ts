import { createZodDto } from "nestjs-zod";
import {
  bookingCreationSchema,
  bookingDetailSchema,
  bookingPageSchema,
  bookingSchema,
  cancelBookingResponseSchema,
} from "@hotel-booking/contracts";

/** `GET` booking-list responses (guest, owner and admin). */
export class BookingPageDto extends createZodDto(bookingPageSchema) {}

/** `POST /api/v1/bookings` — the booking plus its PaymentIntent client secret. */
export class BookingCreationDto extends createZodDto(bookingCreationSchema) {}

/** One booking as the list and guest detail routes return it. */
export class BookingDto extends createZodDto(bookingSchema) {}

/** The admin detail route, with events, ledger and supplier references. */
export class BookingDetailDto extends createZodDto(bookingDetailSchema) {}

/** `POST /api/v1/bookings/:id/cancel` and the admin cancel route. */
export class CancelBookingResponseDto extends createZodDto(cancelBookingResponseSchema) {}
