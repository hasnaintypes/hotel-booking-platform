import type { BookingType } from "@hotel-booking/types";

export const isBookingCancellable = (booking: BookingType): boolean => {
  const status = booking.status || "pending";
  if (status !== "pending" && status !== "confirmed") return false;
  return new Date(booking.checkIn).getTime() > Date.now();
};
