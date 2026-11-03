import apiClient from "@hotel-booking/api-client";
import type { BusinessInsightsRollup, InsightsDashboard } from "./types";

export const fetchInsightsDashboard = async (): Promise<InsightsDashboard> => {
  const response = await apiClient.get("/api/v1/admin/reports/overview");
  return response.data;
};

export const fetchRollups = async (): Promise<BusinessInsightsRollup[]> => {
  const response = await apiClient.get("/api/v1/admin/reports/rollups");
  return response.data;
};

export const createRollup = async (): Promise<BusinessInsightsRollup> => {
  const response = await apiClient.post("/api/v1/admin/reports/rollups");
  return response.data;
};

export const suggestInsightsCopy = async (
  input: string,
): Promise<{ draft: string; provider: string }> => {
  const response = await apiClient.post("/api/v1/manage/ai/suggestions", {
    kind: "insights_copy",
    input,
  });
  return response.data;
};
