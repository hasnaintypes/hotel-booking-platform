import { QueryClient } from "@tanstack/react-query";

/**
 * SPA data cache: modest staleTime cuts duplicate GETs on rapid nav;
 * refetch on focus/reconnect covers back-button / tab return.
 * Mutations must still call invalidate-* helpers for instant CRUD UI.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 0,
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
});
