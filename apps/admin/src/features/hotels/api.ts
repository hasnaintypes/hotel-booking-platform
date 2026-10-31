import apiClient from "@hotel-booking/api-client";
import type { HotelType } from "@hotel-booking/types";

export const fetchHotels = async (): Promise<HotelType[]> => {
  const response = await apiClient.get("/api/hotels");
  return response.data;
};

export const updateHotelActive = async (hotelId: string, isActive: boolean): Promise<HotelType> => {
  const response = await apiClient.patch(`/api/hotels/${hotelId}/active`, {
    isActive,
  });
  return response.data;
};
