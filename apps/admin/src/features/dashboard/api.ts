import apiClient from "@hotel-booking/api-client";
import type {
  CursorPage,
  CursorPageQuery,
  ReportsOverview,
  Rollup,
  SuggestResponse,
} from "@hotel-booking/contracts";

export const fetchInsightsDashboard = async (): Promise<ReportsOverview> => {
  const response = await apiClient.get("/api/v1/admin/reports/overview");
  return response.data;
};

export const fetchRollups = async (params: CursorPageQuery = {}): Promise<CursorPage<Rollup>> => {
  const response = await apiClient.get("/api/v1/admin/reports/rollups", { params });
  return response.data;
};

export const createRollup = async (): Promise<Rollup> => {
  const response = await apiClient.post("/api/v1/admin/reports/rollups");
  return response.data;
};

export const suggestInsightsCopy = async (input: string): Promise<SuggestResponse> => {
  const response = await apiClient.post("/api/v1/manage/ai/suggestions", {
    kind: "insights_copy",
    input,
  });
  return response.data;
};
