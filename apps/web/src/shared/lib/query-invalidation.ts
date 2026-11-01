import { QueryClient } from "@tanstack/react-query";
import { HOTEL_PLACES_QUERY_KEY, clearHotelPlacesCache } from "@/shared/lib/hotel-places";
import { bookingKeys, hotelKeys } from "@/shared/lib/query-keys";

/**
 * Central React Query invalidation for hotel / booking / review CRUD.
 * Call from every mutation onSuccess so current + other pages update without a reload.
 */

export const invalidateHotelQueries = async (queryClient: QueryClient) => {
  // Soft LS cache must drop before RQ refetch or AdvancedSearch/SearchBar stay stale
  clearHotelPlacesCache();
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: hotelKeys.all }),
    queryClient.invalidateQueries({ queryKey: [HOTEL_PLACES_QUERY_KEY] }),
  ]);
};

export const invalidateBookingQueries = async (queryClient: QueryClient) => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: bookingKeys.all }),
    invalidateHotelQueries(queryClient),
  ]);
};

/** After create/update review - refresh detail and my-hotels stats */
export const invalidateReviewQueries = async (queryClient: QueryClient) => {
  await invalidateHotelQueries(queryClient);
};
