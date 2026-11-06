import type { BookingWithPayments } from "../../database/repositories/bookings.repository";

type Payment = BookingWithPayments["payments"][number];

export type BookingPaymentStatus = "pending" | "paid" | "failed" | "refunded";

export type BookingResponse = {
  _id: string;
  userId: string;
  hotelId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  adultCount: number;
  childCount: number;
  checkIn: Date;
  checkOut: Date;
  totalCost: number;
  status: "pending" | "confirmed" | "cancelled" | "completed" | "refunded";
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
    userId: booking.ownerUserId,
    hotelId: booking.hotelId,
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
