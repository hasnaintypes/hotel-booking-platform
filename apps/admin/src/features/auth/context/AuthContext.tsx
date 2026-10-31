import { createContext, useEffect, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import type { UserType } from "@hotel-booking/types";
import { getErrorStatus } from "@/shared/lib/api-error";
import { adminKeys } from "@/shared/lib/query-keys";
import { fetchCurrentUser } from "../api";
import { authToken } from "../auth-storage";

export type AuthContextValue = {
  isLoggedIn: boolean;
  user: UserType | null | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const token = useSyncExternalStore(authToken.subscribe, authToken.get);
  const { data, isLoading, isError, error, refetch } = useQuery<UserType>({
    queryKey: adminKeys.currentUser,
    queryFn: fetchCurrentUser,
    enabled: Boolean(token),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (isError && getErrorStatus(error) === 401) authToken.clear();
  }, [isError, error]);

  return (
    <AuthContext.Provider
      value={{
        isLoggedIn: Boolean(token) && !isError,
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
