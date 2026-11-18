import axiosInstance from "@hotel-booking/api-client";
import type {
  Booking,
  CursorPage,
  CursorPageQuery,
  ManageHotel,
  ManageHotelListItem,
} from "@hotel-booking/contracts";

/** JSON body accepted by the hotel create/update endpoints. */
export type HotelFormPayload = {
  name: string;
  city: string;
  country: string;
  description: string;
  type: string[];
  facilities: string[];
  pricePerNight: number;
  starRating: number;
  adultCount: number;
  childCount: number;
  imageUrls?: string[];
  "contact.phone"?: string;
  "contact.email"?: string;
  "contact.website"?: string;
  "policies.checkInTime"?: string;
  "policies.checkOutTime"?: string;
  "policies.cancellationPolicy"?: string;
  "policies.petPolicy"?: string;
  "policies.smokingPolicy"?: string;
};

const uploadImages = async (hotelId: string, files: File[]): Promise<ManageHotel> => {
  const formData = new FormData();
  files.forEach((file) => formData.append("imageFiles", file));
  const response = await axiosInstance.post(`/api/v1/manage/hotels/${hotelId}/images`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
};

export const addMyHotel = async (
  payload: HotelFormPayload,
  imageFiles: File[] = [],
): Promise<ManageHotel> => {
  const response = await axiosInstance.post<ManageHotel>("/api/v1/manage/hotels", payload);
  if (imageFiles.length === 0) return response.data;
  return uploadImages(response.data._id, imageFiles);
};

export const fetchMyHotels = async (
  params: CursorPageQuery = {},
): Promise<CursorPage<ManageHotelListItem>> => {
  const response = await axiosInstance.get("/api/v1/manage/hotels", { params });
  return response.data;
};

export const fetchMyHotelById = async (hotelId: string): Promise<ManageHotel> => {
  const response = await axiosInstance.get(`/api/v1/manage/hotels/${hotelId}`);
  return response.data;
};

export const updateMyHotelById = async (
  hotelId: string,
  payload: HotelFormPayload,
  imageFiles: File[] = [],
): Promise<ManageHotel> => {
  const response = await axiosInstance.patch<ManageHotel>(
    `/api/v1/manage/hotels/${hotelId}`,
    payload,
  );
  if (imageFiles.length === 0) return response.data;
  return uploadImages(hotelId, imageFiles);
};

/** Owner: toggle own hotel isActive (PATCH /api/v1/manage/hotels/:id/active) */
export const updateMyHotelActive = async (
  hotelId: string,
  isActive: boolean,
): Promise<ManageHotel> => {
  const response = await axiosInstance.patch(`/api/v1/manage/hotels/${hotelId}/active`, {
    isActive,
  });
  return response.data;
};

export const fetchHotelBookings = async (
  hotelId: string,
  params: CursorPageQuery = {},
): Promise<CursorPage<Booking>> => {
  const response = await axiosInstance.get(`/api/v1/manage/hotels/${hotelId}/bookings`, {
    params,
  });
  return response.data;
};
