import axiosInstance, {
  clearIdempotencyKey,
  getErrorStatus,
  idempotencyHeaders,
} from "@hotel-booking/api-client";
import type { BookingCreationType, BookingType, HotelWithBookingsType } from "@hotel-booking/types";
import type { BookingFormData } from "./types";

type CheckoutStay = Pick<
  BookingFormData,
  "hotelId" | "checkIn" | "checkOut" | "adultCount" | "childCount"
>;

const calendarDate = (value: string): string => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString().slice(0, 10);
};

/**
 * One idempotency session per hotel and stay for the browser session. `idempotencyKeyFor` keeps
 * the key in sessionStorage, so a refresh, a double click or the return from a 3-D Secure redirect
 * retries the same request instead of creating a second booking (and a second charge).
 */
export const checkoutSession = (stay: CheckoutStay): string =>
  [
    "checkout",
    stay.hotelId,
    calendarDate(stay.checkIn),
    calendarDate(stay.checkOut),
    stay.adultCount,
    stay.childCount,
  ].join(":");

/**
 * Creates the booking (and its PaymentIntent) once per checkout session. The server computes the
 * total from a frozen offer; the client never sends money.
 */
export const createBooking = async (formData: BookingFormData): Promise<BookingCreationType> => {
  const session = checkoutSession(formData);
  const response = await axiosInstance.post("/api/v1/bookings", formData, {
    headers: idempotencyHeaders(session),
  });
  return response.data;
};

/** Lets a failed or expired checkout start again with a fresh idempotency key. */
export const resetCheckoutSession = (stay: CheckoutStay): void => {
  clearIdempotencyKey(checkoutSession(stay));
};

export const fetchBooking = async (reference: string): Promise<BookingType> => {
  const response = await axiosInstance.get(`/api/v1/bookings/${encodeURIComponent(reference)}`);
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
