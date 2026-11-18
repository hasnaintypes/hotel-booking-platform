import apiClient from "@hotel-booking/api-client";
import type { AdminHotel, CursorPage, CursorPageQuery } from "@hotel-booking/contracts";

export const fetchHotels = async (
  params: CursorPageQuery = {},
): Promise<CursorPage<AdminHotel>> => {
  const response = await apiClient.get("/api/v1/admin/hotels", { params });
  return response.data;
};

export const updateHotelActive = async (
  hotelId: string,
  isActive: boolean,
): Promise<AdminHotel> => {
  const response = await apiClient.patch(`/api/v1/admin/hotels/${hotelId}`, {
    isActive,
  });
  return response.data;
};
