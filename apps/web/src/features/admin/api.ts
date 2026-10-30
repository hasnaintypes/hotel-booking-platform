import axiosInstance from "@/shared/api/client";
import type {
  BookingType,
  HotelType,
  ReviewType,
  UserType,
} from "@hotel-booking/types";

/** Admin: all users */
export const fetchAdminUsers = async (): Promise<UserType[]> => {
  const response = await axiosInstance.get("/api/users");
  return response.data;
};

/** Admin: PATCH user role */
export const updateUserRole = async (
  userId: string,
  role: "user" | "admin" | "hotel_owner",
): Promise<UserType> => {
  const response = await axiosInstance.patch(`/api/users/${userId}/role`, {
    role,
  });
  return response.data;
};

/** Admin: toggle hotel isActive */
export const updateHotelActive = async (
  hotelId: string,
  isActive: boolean,
): Promise<HotelType> => {
  const response = await axiosInstance.patch(`/api/hotels/${hotelId}/active`, {
    isActive,
  });
  return response.data;
};

/** Admin: all bookings */
export const fetchAdminBookings = async (): Promise<BookingType[]> => {
  const response = await axiosInstance.get("/api/bookings");
  return response.data;
};

/** Admin: global reviews */
export const fetchAdminReviews = async (): Promise<ReviewType[]> => {
  const response = await axiosInstance.get("/api/reviews");
  return response.data;
};
