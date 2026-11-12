import apiClient, {
  clearIdempotencyKey,
  getErrorStatus,
  idempotencyHeaders,
} from "@hotel-booking/api-client";
import type { BookingType } from "@hotel-booking/types";

export const fetchBookings = async (): Promise<BookingType[]> => {
  const response = await apiClient.get("/api/v1/admin/bookings");
  return response.data;
};

export const cancelBooking = async (
  bookingId: string,
  cancellationReason?: string,
): Promise<{
  booking: BookingType;
  refundAmount: number;
  refundSkipped?: string;
}> => {
  const session = `admin-cancel:${bookingId}`;
  try {
    const response = await apiClient.post(
      `/api/v1/admin/bookings/${bookingId}/cancel`,
      { cancellationReason },
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
