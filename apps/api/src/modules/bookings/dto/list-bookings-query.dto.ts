import { createZodDto } from "nestjs-zod";
import { adminBookingListQuerySchema } from "@hotel-booking/contracts";

/**
 * Filters for the admin booking and `needs_review` queues, validated by the shared contract.
 *
 * The queue is cursor-paginated: `limit` and `cursor` come from the shared list query, so a caller
 * cannot request an unbounded read and a page boundary is stable while bookings change.
 */
export class ListBookingsQueryDto extends createZodDto(adminBookingListQuerySchema) {}
