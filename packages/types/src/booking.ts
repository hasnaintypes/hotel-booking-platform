import type { BookingType } from "./index";

const CANCELLABLE_STATUSES = new Set(["pending_payment", "authorized", "confirming", "confirmed"]);

/** Upcoming, pre-terminal booking — matches the backend cancel rules. */
export const isBookingCancellable = (booking: BookingType): boolean => {
  if (!booking.status || !CANCELLABLE_STATUSES.has(booking.status)) return false;
  return new Date(booking.checkIn).getTime() > Date.now();
};

export const bookingStatusLabel = (status: BookingType["status"]): string =>
  (status ?? "pending_payment").replace(/_/g, " ");
