import { useQuery } from "@tanstack/react-query";
import type { BookingType } from "@hotel-booking/types";
import { bookingKeys } from "@/shared/lib/query-keys";
import * as bookingsApi from "@/features/bookings/api";
import { isTerminalBookingStatus } from "@/features/bookings/lib/checkout";

/** Stripe confirms asynchronously, so the UI polls the booking until it reaches a terminal state. */
export const BOOKING_POLL_INTERVAL_MS = 2_000;

export function useBookingStatus(reference?: string) {
  return useQuery<BookingType>({
    queryKey: bookingKeys.detail(reference ?? ""),
    queryFn: () => bookingsApi.fetchBooking(reference as string),
    enabled: Boolean(reference),
    // Never refetch checkout status because a window regained focus: the poll below is enough and
    // an extra request while a payment is settling only adds noise.
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchInterval: (query) =>
      isTerminalBookingStatus(query.state.data?.status) ? false : BOOKING_POLL_INTERVAL_MS,
    retry: 2,
  });
}
