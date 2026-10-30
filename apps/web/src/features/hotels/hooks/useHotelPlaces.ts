import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import * as hotelsApi from "@/features/hotels/api";
import {
  HOTEL_PLACES_QUERY_KEY,
  HOTEL_PLACES_TTL_MS,
  clearHotelPlacesCache,
  extractHotelPlaces,
  readHotelPlacesCache,
  writeHotelPlacesCache,
} from "@/shared/lib/hotel-places";

/**
 * Shared destination list for AdvancedSearch + SearchBar.
 * Soft localStorage TTL avoids hammering /api/hotels; CRUD clears cache + invalidates this key.
 */
export function useHotelPlaces() {
  const query = useQuery({
    queryKey: [HOTEL_PLACES_QUERY_KEY],
    queryFn: async () => {
      const soft = readHotelPlacesCache();
      if (soft) return soft;

      const hotels = await hotelsApi.fetchHotels();
      const places = extractHotelPlaces(hotels);
      writeHotelPlacesCache(places);
      return places;
    },
    staleTime: HOTEL_PLACES_TTL_MS,
  });

  useEffect(() => {
    // After invalidateHotelQueries clears LS, refetch must hit the network
    if (query.isError) clearHotelPlacesCache();
  }, [query.isError]);

  return {
    places: query.data ?? [],
    isLoadingPlaces: query.isLoading || query.isFetching,
    error: query.error,
  };
}
