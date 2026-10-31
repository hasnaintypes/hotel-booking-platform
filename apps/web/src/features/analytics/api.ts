import axiosInstance from "@hotel-booking/api-client";

// Business Insights API functions (public endpoints - no auth required)
export const fetchBusinessInsightsDashboard = async () => {
  const response = await axiosInstance.get(
    "/api/business-insights/dashboard/public",
  );
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
