import { QueryClient } from "@tanstack/react-query";
import {
  HOTEL_PLACES_QUERY_KEY,
  clearHotelPlacesCache,
} from "@/shared/lib/hotel-places";

/**
 * Central React Query invalidation for hotel / booking / review CRUD.
 * Call from every mutation onSuccess so current + other pages update without full reload.
 *
 * Keys in use (keep in sync with api-client callers):
 * - fetchMyHotels, fetchMyHotelById — owner dashboard
 * - fetchQuery, searchHotels, fetchHotels — home + search + hotels
 * - fetchHotelById / fetchHotelByID — hotel detail
 * - hotelPlaces — destination typeahead / Popular Destinations (also clears localStorage)
 * - fetchMyBookings, fetchHotelBookings — booking lists
 * - fetchHotelReviews — reviews
 * - business-insights-dashboard | -forecast | -ops — AnalyticsDashboard page keys
 * - fetchCurrentUser — profile role / AdminRoute (invalidate on role PATCH)
 *
 * Insights invalidation lives only in invalidateHotelQueries; booking/review
 * chain through hotel so Insights refreshes once per CRUD (no double invalidate).
 */

/** AnalyticsDashboard keys — called from invalidateHotelQueries */
export const invalidateBusinessInsightsQueries = async (
  queryClient: QueryClient,
) => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["business-insights-dashboard"] }),
    queryClient.invalidateQueries({ queryKey: ["business-insights-forecast"] }),
    queryClient.invalidateQueries({ queryKey: ["business-insights-ops"] }),
  ]);
};

export const invalidateHotelQueries = async (queryClient: QueryClient) => {
  // Soft LS cache must drop before RQ refetch or AdvancedSearch/SearchBar stay stale
  clearHotelPlacesCache();
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["fetchMyHotels"] }),
    queryClient.invalidateQueries({ queryKey: ["fetchMyHotelById"] }),
    queryClient.invalidateQueries({ queryKey: ["fetchQuery"] }),
    queryClient.invalidateQueries({ queryKey: ["searchHotels"] }),
    queryClient.invalidateQueries({ queryKey: ["fetchHotels"] }),
    queryClient.invalidateQueries({ queryKey: ["fetchHotelById"] }),
    queryClient.invalidateQueries({ queryKey: ["fetchHotelByID"] }),
    queryClient.invalidateQueries({ queryKey: [HOTEL_PLACES_QUERY_KEY] }),
    invalidateBusinessInsightsQueries(queryClient),
  ]);
};

export const invalidateBookingQueries = async (queryClient: QueryClient) => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["fetchMyBookings"] }),
    queryClient.invalidateQueries({ queryKey: ["fetchHotelBookings"] }),
    invalidateHotelQueries(queryClient),
  ]);
};

/** After create/update review — refresh detail, my-hotels stats */
export const invalidateReviewQueries = async (queryClient: QueryClient) => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["fetchHotelReviews"] }),
    invalidateHotelQueries(queryClient),
  ]);
};
