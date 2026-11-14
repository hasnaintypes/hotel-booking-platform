import type {
  BookingEventRecord,
  BookingWithPayments,
} from "../../database/repositories/bookings.repository";
import {
  allowedNextStatuses,
  type BookingStatus,
} from "../../domain/bookings/booking-state-machine";

type Payment = BookingWithPayments["payments"][number];

export type BookingPaymentStatus = "pending" | "paid" | "failed" | "refunded";

export type BookingResponse = {
  _id: string;
  publicReference: string;
  userId: string;
  hotelId: string;
  offerId?: string;
  inventorySource?: "managed" | "supplier";
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  adultCount: number;
  childCount: number;
  checkIn: Date;
  checkOut: Date;
  totalCost: number;
  status: BookingStatus;
  allowedTransitions: BookingStatus[];
  paymentStatus: BookingPaymentStatus;
  paymentMethod?: string;
  specialRequests?: string;
  cancellationReason?: string;
  refundAmount: number;
  stripePaymentIntentId?: string;
  createdAt: Date;
  updatedAt: Date;
};

const chargeOf = (payments: Payment[]) => payments.find((payment) => !payment.originalPaymentId);

const toPaymentStatus = (charge: Payment | undefined, hasRefund: boolean): BookingPaymentStatus => {
  if (hasRefund) return "refunded";
  switch (charge?.status) {
    case "paid":
      return "paid";
    case "failed":
      return "failed";
    case "refunded":
      return "refunded";
    default:
      return "pending";
  }
};

const paymentMethodOf = (snapshot: unknown): string | undefined => {
  if (typeof snapshot !== "object" || snapshot === null) return undefined;
  const value = (snapshot as Record<string, unknown>).paymentMethod;
  return typeof value === "string" ? value : undefined;
};

/** Maps the PostgreSQL booking/payment rows to the shape the existing SPAs consume. */
export function toBookingResponse({ booking, payments }: BookingWithPayments): BookingResponse {
  const charge = chargeOf(payments);
  const refunds = payments.filter(
    (payment) => payment.originalPaymentId !== null && payment.status === "refunded",
  );
  const refundAmountMinor = refunds.reduce((sum, payment) => sum + payment.amountMinor, 0);
  const paymentMethod = paymentMethodOf(booking.priceSnapshot);

  return {
    _id: booking.id,
    publicReference: booking.publicReference,
    userId: booking.ownerUserId,
    hotelId: booking.hotelId,
    ...(booking.offerId ? { offerId: booking.offerId } : {}),
    inventorySource: booking.inventorySource,
    firstName: booking.guestFirstName ?? "",
    lastName: booking.guestLastName ?? "",
    email: booking.guestEmail ?? "",
    ...(booking.guestPhone ? { phone: booking.guestPhone } : {}),
    adultCount: booking.adultCount,
    childCount: booking.childCount,
    checkIn: booking.checkIn,
    checkOut: booking.checkOut,
    totalCost: booking.totalAmountMinor / 100,
    status: booking.status,
    allowedTransitions: [...allowedNextStatuses(booking.status)],
    paymentStatus: toPaymentStatus(charge, refunds.length > 0),
    ...(paymentMethod ? { paymentMethod } : {}),
    ...(booking.specialRequests ? { specialRequests: booking.specialRequests } : {}),
    ...(booking.cancellationReason ? { cancellationReason: booking.cancellationReason } : {}),
    refundAmount: refundAmountMinor / 100,
    ...(charge?.provider === "stripe" ? { stripePaymentIntentId: charge.providerPaymentId } : {}),
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
  };
}

/** The creation response adds the PaymentIntent secret; subsequent reads omit it. */
export type BookingCreationResponse = BookingResponse & {
  clientSecret: string | null;
};

export type BookingEventResponse = {
  id: string;
  fromStatus: BookingStatus | null;
  toStatus: BookingStatus;
  actorUserId?: string;
  reason?: string;
  requestId?: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
};

export type BookingPaymentResponse = {
  id: string;
  /** A refund is a separate payment row that points at the original charge. */
  kind: "charge" | "refund";
  provider: string;
  providerReference?: string;
  status: Payment["status"];
  amountMinor: number;
  capturedAmountMinor?: number;
  currencyCode: string;
  originalPaymentId?: string;
  createdAt: Date;
  updatedAt: Date;
};

/** Everything an operator needs on the detail page, including how the booking got here. */
export type BookingDetailResponse = BookingResponse & {
  version: number;
  expiresAt?: Date;
  supplierId?: string;
  supplierReference?: string;
  events: BookingEventResponse[];
  payments: BookingPaymentResponse[];
};

const metadataOf = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const toEventResponse = (event: BookingEventRecord): BookingEventResponse => ({
  id: event.id,
  fromStatus: event.fromStatus,
  toStatus: event.toStatus,
  ...(event.actorUserId ? { actorUserId: event.actorUserId } : {}),
  ...(event.reason ? { reason: event.reason } : {}),
  ...(event.requestId ? { requestId: event.requestId } : {}),
  metadata: metadataOf(event.metadata),
  createdAt: event.createdAt,
});

const toPaymentResponse = (payment: Payment): BookingPaymentResponse => ({
  id: payment.id,
  kind: payment.originalPaymentId ? "refund" : "charge",
  provider: payment.provider,
  ...(payment.providerPaymentId ? { providerReference: payment.providerPaymentId } : {}),
  status: payment.status,
  amountMinor: payment.amountMinor,
  ...(payment.capturedAmountMinor !== null
    ? { capturedAmountMinor: payment.capturedAmountMinor }
    : {}),
  currencyCode: payment.currencyCode,
  ...(payment.originalPaymentId ? { originalPaymentId: payment.originalPaymentId } : {}),
  createdAt: payment.createdAt,
  updatedAt: payment.updatedAt,
});

export function toBookingDetailResponse(
  record: BookingWithPayments,
  events: BookingEventRecord[],
): BookingDetailResponse {
  const { booking, payments } = record;
  return {
    ...toBookingResponse(record),
    version: booking.version,
    ...(booking.expiresAt ? { expiresAt: booking.expiresAt } : {}),
    ...(booking.supplierId ? { supplierId: booking.supplierId } : {}),
    ...(booking.supplierReference ? { supplierReference: booking.supplierReference } : {}),
    events: events.map(toEventResponse),
    payments: payments.map(toPaymentResponse),
  };
}
