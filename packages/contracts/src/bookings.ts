import { z } from "zod";
import { optionalBody, optionalTrimmedText, trimmed, trimmedAs, trimmedText } from "./body";
import { cursorPageSchema } from "./pagination";
import { isoDateTimeInputSchema, isoDateTimeSchema, uuidSchema } from "./primitives";

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

/** A reason that lands on a booking event beside the actor, permission and request id. */
export const BOOKING_REASON_MIN_LENGTH = 3;
export const BOOKING_REASON_MAX_LENGTH = 500;

const PHONE_PATTERN = /^[+()\d][\d\s().-]{5,24}$/;

/**
 * `POST /api/v1/bookings`. The body describes the stay only: the server prices it from the hotel's
 * own rate (or from a frozen offer) and creates the PaymentIntent from that quote, so money fields
 * are absent and unknown ones are stripped.
 *
 * Formats are checked here. Rules that depend on the hotel or on today's date (check-out after
 * check-in, not in the past, maximum stay, guest capacity) are enforced in the API service.
 */
export const createBookingRequestSchema = z.object({
  /**
   * A frozen offer from `POST /offers`. When present the stay fields must match it and its price
   * and cancellation terms are used verbatim; when absent the server quotes managed inventory.
   */
  offerId: uuidSchema.optional(),
  hotelId: uuidSchema,
  firstName: trimmedText(100, 1),
  lastName: trimmedText(100, 1),
  email: trimmedAs(z.email().max(254)),
  phone: z.preprocess(
    trimmed,
    z.string().regex(PHONE_PATTERN, { error: "phone must be a valid phone number" }).optional(),
  ),
  adultCount: z.number().int().min(1).max(50),
  childCount: z.number().int().min(0).max(50),
  checkIn: isoDateTimeInputSchema,
  checkOut: isoDateTimeInputSchema,
  specialRequests: optionalTrimmedText(1000),
});

/** `POST /api/v1/bookings/:id/cancel`: a guest may cancel without writing a reason. */
export const cancelBookingRequestSchema = optionalBody(
  z.object({
    cancellationReason: z.string().optional(),
  }),
);

/** `POST /api/v1/admin/bookings/:id/cancel`: an operator must write why they cancelled. */
export const adminCancelBookingRequestSchema = z.object({
  reason: trimmedText(BOOKING_REASON_MAX_LENGTH, BOOKING_REASON_MIN_LENGTH),
});

/** `POST /api/v1/admin/bookings/:id/{retry,review}`: manual actions always demand a reason. */
export const manualBookingActionRequestSchema = z.object({
  reason: trimmedText(BOOKING_REASON_MAX_LENGTH, BOOKING_REASON_MIN_LENGTH),
});

export type CreateBookingRequest = z.infer<typeof createBookingRequestSchema>;
export type CancelBookingRequest = z.infer<typeof cancelBookingRequestSchema>;
export type AdminCancelBookingRequest = z.infer<typeof adminCancelBookingRequestSchema>;
export type ManualBookingActionRequest = z.infer<typeof manualBookingActionRequestSchema>;
