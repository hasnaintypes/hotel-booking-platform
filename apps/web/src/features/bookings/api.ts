import axiosInstance from "@hotel-booking/api-client";
import type {
  BookingType,
  HotelWithBookingsType,
  PaymentIntentResponse,
} from "@hotel-booking/types";
import type { BookingFormData } from "./types";

export const createPaymentIntent = async (
  hotelId: string,
  numberOfNights: string,
): Promise<PaymentIntentResponse> => {
  const response = await axiosInstance.post(`/api/hotels/${hotelId}/bookings/payment-intent`, {
    numberOfNights,
  });
  return response.data;
};

export const createRoomBooking = async (formData: BookingFormData) => {
  const response = await axiosInstance.post(`/api/hotels/${formData.hotelId}/bookings`, formData);
  return response.data;
};

export const fetchMyBookings = async (): Promise<HotelWithBookingsType[]> => {
  const response = await axiosInstance.get("/api/my-bookings");
  return response.data;
};

/** Guest / owner / admin cancel — may trigger Stripe full refund when paid */
export const cancelBooking = async (
  bookingId: string,
  payload?: { cancellationReason?: string },
): Promise<{
  booking: BookingType;
  refundAmount: number;
  refundSkipped?: string;
}> => {
  const response = await axiosInstance.post(`/api/bookings/${bookingId}/cancel`, payload || {});
  return response.data;
};
