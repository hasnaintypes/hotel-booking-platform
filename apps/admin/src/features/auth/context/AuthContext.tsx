import { createContext, useEffect, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { authSession, getErrorStatus } from "@hotel-booking/api-client";
import type { PublicUser } from "@hotel-booking/contracts";
import { adminKeys } from "@/shared/lib/query-keys";
import { fetchCurrentUser } from "../api";
import { clearUserDetails } from "../auth-storage";

export type AuthContextValue = {
  isLoggedIn: boolean;
  user: PublicUser | null | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const hasSession = useSyncExternalStore(authSession.subscribe, authSession.get, () => false);
  const { data, isLoading, isError, error, refetch } = useQuery<PublicUser>({
    queryKey: adminKeys.currentUser,
    queryFn: fetchCurrentUser,
    enabled: hasSession,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (isError && getErrorStatus(error) === 401) {
      authSession.clear();
      clearUserDetails();
    }
  }, [isError, error]);

  return (
    <AuthContext.Provider
      value={{
        isLoggedIn: hasSession && !isError,
        user: data,
        isLoading,
        isError,
        error,
        refetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
