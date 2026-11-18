import axiosInstance from "@hotel-booking/api-client";
import type { CursorPage, CursorPageQuery, Review } from "@hotel-booking/contracts";

/** Public list of reviews for a hotel, newest first. */
export const fetchHotelReviews = async (
  hotelId: string,
  params: CursorPageQuery = {},
): Promise<CursorPage<Review>> => {
  const response = await axiosInstance.get(`/api/v1/hotels/${hotelId}/reviews`, { params });
  return response.data;
};

/** Create review (JWT) — invalidates hotel/review queries in callers */
export const createHotelReview = async (payload: {
  hotelId: string;
  bookingId: string;
  rating: number;
  comment: string;
  categories: {
    cleanliness: number;
    service: number;
    location: number;
    value: number;
    amenities: number;
  };
}) => {
  const response = await axiosInstance.post(
    "/api/v1/bookings/${payload.bookingId}/reviews",
    payload,
  );
  return response.data;
};
