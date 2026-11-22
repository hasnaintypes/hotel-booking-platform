import { z } from "zod";
import { BOOKING_PAYMENT_STATUS_VALUES, BOOKING_STATUS_VALUES } from "./bookings";
import { cursorPageSchema } from "./pagination";
import { isoDateTimeSchema, uuidSchema } from "./primitives";

/**
 * A count for every value in a vocabulary. Building the object from the shared constant keeps the
 * rollup snapshot from silently missing a status when the booking lifecycle grows.
 */
const countsFor = <T extends readonly string[]>(values: T) =>
  z.object(
    Object.fromEntries(values.map((value) => [value, z.number().int()])) as Record<
      T[number],
      z.ZodNumber
    >,
  );

/** One persisted business-insights snapshot, as the admin rollup routes return it. */
export const rollupSchema = z.object({
  _id: uuidSchema,
  /** The snapshot instant; a `Date` in the repository, an ISO string on the wire. */
  date: isoDateTimeSchema,
  metrics: z.object({
    totalBookings: z.number().int(),
    totalRevenue: z.number(),
    totalUsers: z.number().int(),
    totalHotels: z.number().int(),
    averageBookingValue: z.number(),
    cancellationRate: z.number(),
    averageRating: z.number(),
  }),
  breakdown: z.object({
    byStatus: countsFor(BOOKING_STATUS_VALUES),
    byPaymentStatus: countsFor(BOOKING_PAYMENT_STATUS_VALUES),
    byDestination: z.array(
      z.object({ city: z.string(), bookings: z.number().int(), revenue: z.number() }),
    ),
    byHotelType: z.array(
      z.object({ type: z.string(), bookings: z.number().int(), revenue: z.number() }),
    ),
  }),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

/** `GET /api/v1/admin/reports/rollups`. */
export const rollupPageSchema = cursorPageSchema(rollupSchema);

export type Rollup = z.infer<typeof rollupSchema>;
export type RollupPage = z.infer<typeof rollupPageSchema>;
