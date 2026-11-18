import type { Booking } from "@hotel-booking/contracts";

const CANCELLABLE_STATUSES = new Set(["pending_payment", "authorized", "confirming", "confirmed"]);

/** Upcoming, pre-terminal booking — matches the backend cancel rules. */
export const isBookingCancellable = (booking: Booking): boolean => {
  if (!CANCELLABLE_STATUSES.has(booking.status)) return false;
  return new Date(booking.checkIn).getTime() > Date.now();
};

export const bookingStatusLabel = (status: Booking["status"]): string => status.replace(/_/g, " ");
