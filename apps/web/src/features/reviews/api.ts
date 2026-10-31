import axiosInstance from "@hotel-booking/api-client";

/** Public list of reviews for a hotel */
export const fetchHotelReviews = async (hotelId: string) => {
  const response = await axiosInstance.get(`/api/reviews/hotel/${hotelId}`);
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
  const response = await axiosInstance.post("/api/reviews", payload);
  return response.data;
};
