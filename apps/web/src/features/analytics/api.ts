import axiosInstance from "@/shared/api/client";
import type { AnalyticsSnapshot, BusinessInsightsRollup } from "./types";

export type { AnalyticsSnapshot, BusinessInsightsRollup };

// Business Insights API functions (public endpoints - no auth required)
export const fetchBusinessInsightsDashboard = async () => {
  const response = await axiosInstance.get(
    "/api/business-insights/dashboard/public",
  );
  return response.data;
};

/** Admin: JWT-gated dashboard (same payload as public) */
export const fetchAdminBusinessInsightsDashboard = async () => {
  const response = await axiosInstance.get("/api/business-insights/dashboard");
  return response.data;
};

export const fetchBusinessInsightsForecast = async () => {
  const response = await axiosInstance.get(
    "/api/business-insights/forecast/public",
  );
  return response.data;
};

/** Public/auth ops figures (system-stats) — avoids /performance in the URL */
export const fetchBusinessInsightsSystemStats = async () => {
  const response = await axiosInstance.get(
    "/api/business-insights/system-stats/public",
  );
  return response.data;
};

/** @deprecated Prefer fetchBusinessInsightsSystemStats */
export const fetchBusinessInsightsPerformance = fetchBusinessInsightsSystemStats;

/** Admin: list business-insights rollups (blocker-safe; not under /analytics) */
export const fetchBusinessInsightsRollups = async (): Promise<
  BusinessInsightsRollup[]
> => {
  const response = await axiosInstance.get("/api/business-insights/rollups");
  return response.data;
};

/** Admin: capture a live rollup */
export const createBusinessInsightsRollup =
  async (): Promise<BusinessInsightsRollup> => {
    const response = await axiosInstance.post("/api/business-insights/rollups");
    return response.data;
  };

/** @deprecated Prefer fetchBusinessInsightsRollups */
export const fetchAnalyticsSnapshots = fetchBusinessInsightsRollups;

/** @deprecated Prefer createBusinessInsightsRollup */
export const createAnalyticsSnapshot = createBusinessInsightsRollup;
