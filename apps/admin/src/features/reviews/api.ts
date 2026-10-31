import apiClient from "@hotel-booking/api-client";
import type { ReviewType } from "@hotel-booking/types";

export const fetchReviews = async (): Promise<ReviewType[]> => {
  const response = await apiClient.get("/api/reviews");
  return response.data;
};
