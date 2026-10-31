import type { QueryClient } from "@tanstack/react-query";
import {
  fetchBusinessInsightsDashboard,
  fetchBusinessInsightsForecast,
  fetchBusinessInsightsSystemStats,
} from "../api";
import { analyticsKeys } from "@/shared/lib/query-keys";

/** Prefetch Insights tabs on nav hover (MainNav / MobileNavLinks) */
export const prefetchBusinessInsightsQueries = (queryClient: QueryClient) => {
  void queryClient.prefetchQuery({
    queryKey: analyticsKeys.dashboard(),
    queryFn: fetchBusinessInsightsDashboard,
  });
  void queryClient.prefetchQuery({
    queryKey: analyticsKeys.forecast(),
    queryFn: fetchBusinessInsightsForecast,
  });
  void queryClient.prefetchQuery({
    queryKey: analyticsKeys.ops(),
    queryFn: fetchBusinessInsightsSystemStats,
  });
};
