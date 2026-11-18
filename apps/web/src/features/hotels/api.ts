import axiosInstance from "@hotel-booking/api-client";
import type {
  CursorPage,
  CursorPageQuery,
  HotelSearchResponse,
  PublicHotel,
} from "@hotel-booking/contracts";

export type SearchParams = {
  destination?: string;
  adultCount?: string;
  childCount?: string;
  cursor?: string;
  limit?: number;
  facilities?: string[];
  types?: string[];
  stars?: string[];
  maxPrice?: string;
  sortOption?: string;
};

export const searchHotels = async (searchParams: SearchParams): Promise<HotelSearchResponse> => {
  const queryParams = new URLSearchParams();

  // Only add destination if it's not empty
  if (searchParams.destination && searchParams.destination.trim() !== "") {
    queryParams.append("destination", searchParams.destination.trim());
  }

  queryParams.append("adultCount", searchParams.adultCount || "");
  queryParams.append("childCount", searchParams.childCount || "");
  queryParams.append("maxPrice", searchParams.maxPrice || "");
  queryParams.append("sortOption", searchParams.sortOption || "");

  if (searchParams.limit !== undefined) {
    queryParams.append("limit", String(searchParams.limit));
  }
  // A null cursor means "last page"; never send it as a value.
  if (searchParams.cursor) {
    queryParams.append("cursor", searchParams.cursor);
  }

  searchParams.facilities?.forEach((facility) => queryParams.append("facilities", facility));

  searchParams.types?.forEach((type) => queryParams.append("types", type));
  searchParams.stars?.forEach((star) => queryParams.append("stars", star));

  const response = await axiosInstance.get(`/api/v1/hotels/search?${queryParams}`);
  return response.data;
};

export const fetchHotels = async (
  params: CursorPageQuery = {},
): Promise<CursorPage<PublicHotel>> => {
  const response = await axiosInstance.get("/api/v1/hotels", { params });
  return response.data;
};

export const fetchHotelById = async (hotelId: string): Promise<PublicHotel> => {
  const response = await axiosInstance.get(`/api/v1/hotels/${hotelId}`);
  return response.data;
};
