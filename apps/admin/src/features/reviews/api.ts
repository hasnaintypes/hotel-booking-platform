import apiClient from "@hotel-booking/api-client";
import type { CursorPage, ListQuery, ReviewType } from "@hotel-booking/types";

export const fetchReviews = async (params: ListQuery = {}): Promise<CursorPage<ReviewType>> => {
  const response = await apiClient.get("/api/v1/admin/reviews", { params });
  return response.data;
};
