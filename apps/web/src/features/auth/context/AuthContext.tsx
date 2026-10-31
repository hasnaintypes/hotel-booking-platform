import React, { createContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import type { UserType } from "@hotel-booking/types";
import { clearAuthStorage, fetchCurrentUser } from "../api";
import { getSessionToken, subscribeToAuth } from "../auth-storage";
import { authKeys } from "@/shared/lib/query-keys";

export type AuthContextValue = {
  isLoggedIn: boolean;
  user: UserType | null | undefined;
  isLoading: boolean;
  isError: boolean;
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const hasStoredToken = useSyncExternalStore(
    subscribeToAuth,
    () => Boolean(getSessionToken()),
    () => false,
  );

  // Guests skip /users/me, avoiding expected 401 noise in production.
  const { isError, data, isLoading, error } = useQuery<UserType>({
    queryKey: authKeys.currentUser(),
    queryFn: fetchCurrentUser,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
    enabled: hasStoredToken,
  });

  useEffect(() => {
    const status = (error as { response?: { status?: number } })?.response?.status;
    // Only an invalid/expired token should wipe storage; keep it on network/5xx.
    if (isError && status === 401) clearAuthStorage();
  }, [isError, error]);

  // Optimistic nav chrome: JWT in localStorage shows profile until validation fails.
  const isLoggedIn = hasStoredToken && !isError;

  const value = useMemo(
    () => ({
      isLoggedIn,
      user: data,
      isLoading,
      isError,
    }),
    [isLoggedIn, data, isLoading, isError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
