import apiClient from "@hotel-booking/api-client";
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
  const response = await apiClient.post(`/api/v1/admin/bookings/${bookingId}/cancellations`, {
    cancellationReason,
  });
  return response.data;
};
