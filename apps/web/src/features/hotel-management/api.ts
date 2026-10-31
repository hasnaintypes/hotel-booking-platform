import axiosInstance from "@hotel-booking/api-client";
import type { BookingType, HotelType } from "@hotel-booking/types";

export const addMyHotel = async (hotelFormData: FormData) => {
  const response = await axiosInstance.post("/api/my-hotels", hotelFormData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return response.data;
};

export const fetchMyHotels = async (): Promise<HotelType[]> => {
  const response = await axiosInstance.get("/api/my-hotels");
  return response.data;
};

export const fetchMyHotelById = async (hotelId: string): Promise<HotelType> => {
  const response = await axiosInstance.get(`/api/my-hotels/${hotelId}`);
  return response.data;
};

export const updateMyHotelById = async (hotelFormData: FormData) => {
  const hotelId = hotelFormData.get("hotelId");
  const response = await axiosInstance.put(
    `/api/my-hotels/${hotelId}`,
    hotelFormData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    },
  );
  return response.data;
};

/** Owner: toggle own hotel isActive (PATCH /api/my-hotels/:id/active) */
export const updateMyHotelActive = async (
  hotelId: string,
  isActive: boolean,
): Promise<HotelType> => {
  const response = await axiosInstance.patch(
    `/api/my-hotels/${hotelId}/active`,
    { isActive },
  );
  return response.data;
};

export const fetchHotelBookings = async (
  hotelId: string,
): Promise<BookingType[]> => {
  const response = await axiosInstance.get(`/api/bookings/hotel/${hotelId}`);
  return response.data;
};
