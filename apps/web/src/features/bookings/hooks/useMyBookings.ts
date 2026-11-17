import { infiniteQueryOptions } from "@tanstack/react-query";
import type { CursorPage, BookingType } from "@hotel-booking/types";
import { bookingKeys } from "@/shared/lib/query-keys";
import * as bookingsApi from "@/features/bookings/api";

/** Large enough that most guests see every booking without pressing "Load more". */
export const MY_BOOKINGS_PAGE_SIZE = 50;

/**
 * Shared by the My Bookings page and the nav hover prefetch so both read the same infinite cache
 * entry. Keeping it in one place stops the prefetch from seeding a non-infinite shape.
 */
export const myBookingsQueryOptions = infiniteQueryOptions({
  queryKey: bookingKeys.mine(),
  initialPageParam: undefined as string | undefined,
  queryFn: ({ pageParam }) =>
    bookingsApi.fetchMyBookings({ limit: MY_BOOKINGS_PAGE_SIZE, cursor: pageParam }),
  getNextPageParam: (lastPage: CursorPage<BookingType>) =>
    lastPage.pageInfo.nextCursor ?? undefined,
});
