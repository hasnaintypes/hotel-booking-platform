import type { BookingStatus } from "@hotel-booking/types";

/** Badge colours shared by the bookings list, detail page and review queues. */
export const bookingStatusClass = (status?: BookingStatus | string) => {
  switch (status) {
    case "confirmed":
      return "bg-green-100 text-green-800";
    case "pending_payment":
      return "bg-yellow-100 text-yellow-800";
    case "authorized":
    case "confirming":
    case "cancelling":
      return "bg-blue-100 text-blue-800";
    case "cancelled":
    case "failed":
    case "expired":
      return "bg-red-100 text-red-800";
    case "needs_review":
      return "bg-purple-100 text-purple-800";
    default:
      return "bg-slate-100 text-slate-800";
  }
};

export const paymentStatusClass = (status?: string) => {
  switch (status) {
    case "paid":
      return "bg-green-100 text-green-800";
    case "pending":
    case "authorized":
      return "bg-yellow-100 text-yellow-800";
    case "failed":
      return "bg-red-100 text-red-800";
    case "refunded":
      return "bg-slate-100 text-slate-800";
    default:
      return "bg-slate-100 text-slate-800";
  }
};
