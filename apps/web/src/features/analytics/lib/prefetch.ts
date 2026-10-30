import type { QueryClient } from "@tanstack/react-query";
import {
  fetchBusinessInsightsDashboard,
  fetchBusinessInsightsForecast,
  fetchBusinessInsightsSystemStats,
} from "../api";

/** Prefetch Insights tabs on nav hover (MainNav / MobileNavLinks) */
export const prefetchBusinessInsightsQueries = (queryClient: QueryClient) => {
  void queryClient.prefetchQuery({
    queryKey: ["business-insights-dashboard"],
    queryFn: fetchBusinessInsightsDashboard,
  });
  void queryClient.prefetchQuery({
    queryKey: ["business-insights-forecast"],
    queryFn: fetchBusinessInsightsForecast,
  });
  void queryClient.prefetchQuery({
    queryKey: ["business-insights-ops"],
    queryFn: fetchBusinessInsightsSystemStats,
  });
};
