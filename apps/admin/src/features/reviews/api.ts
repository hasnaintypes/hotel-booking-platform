import apiClient from "@hotel-booking/api-client";
import type { CursorPage, CursorPageQuery, Review } from "@hotel-booking/contracts";

export const fetchReviews = async (params: CursorPageQuery = {}): Promise<CursorPage<Review>> => {
  const response = await apiClient.get("/api/v1/admin/reviews", { params });
  return response.data;
};
