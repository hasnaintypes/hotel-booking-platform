import apiClient, {
  clearIdempotencyKey,
  getErrorStatus,
  idempotencyHeaders,
} from "@hotel-booking/api-client";
import type { BookingDetailType, BookingListFilters, BookingType } from "@hotel-booking/types";

const queryParams = (filters: BookingListFilters) =>
  Object.fromEntries(
    Object.entries(filters).filter(
      ([, value]) => value !== undefined && value !== null && value !== "",
    ),
  );

export const fetchBookings = async (filters: BookingListFilters = {}): Promise<BookingType[]> => {
  const response = await apiClient.get("/api/v1/admin/bookings", {
    params: queryParams(filters),
  });
  return response.data;
};

export const fetchBookingDetail = async (bookingId: string): Promise<BookingDetailType> => {
  const response = await apiClient.get(`/api/v1/admin/bookings/${bookingId}`);
  return response.data;
};

export const retryBooking = async (
  bookingId: string,
  reason: string,
): Promise<BookingDetailType> => {
  const response = await apiClient.post(`/api/v1/admin/bookings/${bookingId}/retry`, { reason });
  return response.data;
};

export const markBookingReviewed = async (
  bookingId: string,
  reason: string,
): Promise<BookingDetailType> => {
  const response = await apiClient.post(`/api/v1/admin/bookings/${bookingId}/review`, { reason });
  return response.data;
};

export const cancelBooking = async (
  bookingId: string,
  reason: string,
): Promise<{
  booking: BookingType;
  refundAmount: number;
  refundSkipped?: string;
}> => {
  const session = `admin-cancel:${bookingId}`;
  try {
    const response = await apiClient.post(
      `/api/v1/admin/bookings/${bookingId}/cancel`,
      { reason },
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
