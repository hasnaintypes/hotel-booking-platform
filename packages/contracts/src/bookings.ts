import { z } from "zod";
import { cursorPageSchema } from "./pagination";
import { isoDateTimeSchema, uuidSchema } from "./primitives";

/** Booking lifecycle values, shared by the list filters and every booking response. */
export const BOOKING_STATUS_VALUES = [
  "pending_payment",
  "authorized",
  "confirming",
  "confirmed",
  "cancelling",
  "cancelled",
  "failed",
  "expired",
  "needs_review",
] as const;

/** Statuses a booking's payment can present on a read response. */
export const BOOKING_PAYMENT_STATUS_VALUES = ["pending", "paid", "failed", "refunded"] as const;

/** Every status a `payments` ledger row can hold, including a captured authorization. */
export const PAYMENT_LEDGER_STATUS_VALUES = [
  "pending",
  "authorized",
  "paid",
  "failed",
  "refunded",
] as const;

export const bookingStatusSchema = z.enum(BOOKING_STATUS_VALUES);
export const bookingPaymentStatusSchema = z.enum(BOOKING_PAYMENT_STATUS_VALUES);

/** One booking as the guest, owner and admin list endpoints return it. */
export const bookingSchema = z.object({
  _id: uuidSchema,
  publicReference: z.string(),
  userId: uuidSchema,
  hotelId: uuidSchema,
  offerId: uuidSchema.optional(),
  inventorySource: z.enum(["managed", "supplier"]).optional(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  phone: z.string().optional(),
  adultCount: z.number().int(),
  childCount: z.number().int(),
  checkIn: isoDateTimeSchema,
  checkOut: isoDateTimeSchema,
  totalCost: z.number(),
  status: bookingStatusSchema,
  allowedTransitions: z.array(bookingStatusSchema),
  paymentStatus: bookingPaymentStatusSchema,
  paymentMethod: z.string().optional(),
  specialRequests: z.string().optional(),
  cancellationReason: z.string().optional(),
  refundAmount: z.number(),
  stripePaymentIntentId: z.string().optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

/** `POST /api/v1/bookings` adds the PaymentIntent client secret; later reads omit it. */
export const bookingCreationSchema = bookingSchema.extend({
  clientSecret: z.string().nullable(),
});

export const bookingPageSchema = cursorPageSchema(bookingSchema);

/** One append-only `booking_events` row; a null `fromStatus` means the booking was created. */
export const bookingEventSchema = z.object({
  id: uuidSchema,
  fromStatus: bookingStatusSchema.nullable(),
  toStatus: bookingStatusSchema,
  actorUserId: uuidSchema.optional(),
  reason: z.string().optional(),
  requestId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: isoDateTimeSchema,
});

/** One payments ledger row: a charge, or a refund that points at its original charge. */
export const bookingPaymentSchema = z.object({
  id: uuidSchema,
  kind: z.enum(["charge", "refund"]),
  provider: z.string(),
  providerReference: z.string().optional(),
  status: z.enum(PAYMENT_LEDGER_STATUS_VALUES),
  amountMinor: z.number().int(),
  capturedAmountMinor: z.number().int().optional(),
  currencyCode: z.string(),
  originalPaymentId: uuidSchema.optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

/** The operator detail response: the booking plus its history, ledger and supplier references. */
export const bookingDetailSchema = bookingSchema.extend({
  version: z.number().int(),
  expiresAt: isoDateTimeSchema.optional(),
  supplierId: z.string().optional(),
  supplierReference: z.string().optional(),
  events: z.array(bookingEventSchema),
  payments: z.array(bookingPaymentSchema),
});

/** `POST /api/v1/bookings/:id/cancel` (guest, owner or admin). */
export const cancelBookingResponseSchema = z.object({
  booking: bookingSchema,
  refundAmount: z.number(),
  refundSkipped: z.string().optional(),
});

export type BookingStatus = (typeof BOOKING_STATUS_VALUES)[number];
export type BookingPaymentStatus = (typeof BOOKING_PAYMENT_STATUS_VALUES)[number];
export type Booking = z.infer<typeof bookingSchema>;
export type BookingCreation = z.infer<typeof bookingCreationSchema>;
export type BookingPage = z.infer<typeof bookingPageSchema>;
export type BookingEvent = z.infer<typeof bookingEventSchema>;
export type BookingPayment = z.infer<typeof bookingPaymentSchema>;
export type BookingDetail = z.infer<typeof bookingDetailSchema>;
export type CancelBookingResponse = z.infer<typeof cancelBookingResponseSchema>;
