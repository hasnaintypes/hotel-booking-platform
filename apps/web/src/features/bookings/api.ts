import axiosInstance, {
  clearIdempotencyKey,
  getErrorStatus,
  idempotencyHeaders,
} from "@hotel-booking/api-client";
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
  const response = await axiosInstance.post("/api/v1/bookings/payment-intents", {
    hotelId,
    numberOfNights,
  });
  return response.data;
};

export const createRoomBooking = async (formData: BookingFormData) => {
  const session = `booking:${formData.paymentIntentId}`;
  const response = await axiosInstance.post("/api/v1/bookings", formData, {
    headers: idempotencyHeaders(session),
  });
  clearIdempotencyKey(session);
  return response.data;
};

export const fetchMyBookings = async (): Promise<HotelWithBookingsType[]> => {
  const response = await axiosInstance.get("/api/v1/bookings");
  return response.data;
};

/** Guest / owner / admin cancel — refunds whatever the booking's frozen policy allows */
export const cancelBooking = async (
  bookingId: string,
  payload?: { cancellationReason?: string },
): Promise<{
  booking: BookingType;
  refundAmount: number;
  refundSkipped?: string;
}> => {
  const session = `cancel:${bookingId}`;
  try {
    const response = await axiosInstance.post(
      `/api/v1/bookings/${bookingId}/cancel`,
      payload || {},
      { headers: idempotencyHeaders(session) },
    );
    clearIdempotencyKey(session);
    return response.data;
  } catch (error) {
    const status = getErrorStatus(error);
    if (status && status >= 400 && status < 500 && status !== 409 && status !== 429) {
      clearIdempotencyKey(session);
    }
    throw error;
  }
};
