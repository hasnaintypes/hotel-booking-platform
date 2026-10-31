import { QueryClient } from "@tanstack/react-query";

/**
 * SPA data cache: modest staleTime cuts duplicate GETs on rapid nav;
 * refetch on focus/reconnect covers back-button / tab return.
 * Mutations must still call invalidate-* helpers for instant CRUD UI.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retry transient GET failures only; auth/validation errors are terminal.
      retry: (failureCount, error: unknown) => {
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
});
