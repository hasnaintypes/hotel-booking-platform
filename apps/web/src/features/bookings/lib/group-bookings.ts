import type { Booking } from "@hotel-booking/contracts";

/** One hotel's bookings, kept in the order the server returned them (newest first). */
export type HotelBookingGroup = {
  hotelId: string;
  bookings: Booking[];
};

/**
 * `GET /api/v1/bookings` is a flat cursor page of booking rows that only carry `hotelId`, so the
 * My Bookings page groups them into hotel cards here. Insertion order is preserved per hotel.
 */
export const groupBookingsByHotel = (bookings: Booking[]): HotelBookingGroup[] => {
  const groups = new Map<string, Booking[]>();
  for (const booking of bookings) {
    const existing = groups.get(booking.hotelId);
    if (existing) {
      existing.push(booking);
    } else {
      groups.set(booking.hotelId, [booking]);
    }
  }
  return Array.from(groups, ([hotelId, hotelBookings]) => ({
    hotelId,
    bookings: hotelBookings,
  }));
};

export type BookingSummary = {
  totalBookings: number;
  differentHotels: number;
  /** Sum of the server-computed booking totals, in major units. */
  totalSpent: number;
};

/** Header totals for the accumulated rows; reflects only the pages loaded so far. */
export const summarizeBookings = (bookings: Booking[]): BookingSummary => ({
  totalBookings: bookings.length,
  differentHotels: new Set(bookings.map((booking) => booking.hotelId)).size,
  totalSpent: bookings.reduce((total, booking) => total + (booking.totalCost || 0), 0),
});
