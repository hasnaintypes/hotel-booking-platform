import React, { createContext, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { UserType } from "@hotel-booking/types";
import { clearAuthStorage, validateToken } from "../api";

export type AuthContextValue = {
  isLoggedIn: boolean;
  user: UserType | null | undefined;
  isLoading: boolean;
  isError: boolean;
};

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const hasStoredToken =
    typeof window !== "undefined" && !!localStorage.getItem("session_id");

  // Guests: skip validate-token (avoids expected 401 noise in prod console)
  const { isError, data, isLoading } = useQuery<UserType | null>({
    queryKey: ["validateToken"],
    queryFn: validateToken,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
    enabled: hasStoredToken,
  });

  useEffect(() => {
    // Stale/expired JWT — clear storage so isLoggedIn stays false
    if (isError) clearAuthStorage();
  }, [isError]);

  // Optimistic nav chrome: JWT in localStorage → show profile until validate fails
  // (avoids Log In flash on refresh while validateToken is loading)
  const isLoggedIn = hasStoredToken ? !isError : Boolean(data) && !isError;

  return (
    <AuthContext.Provider
      value={{ isLoggedIn, user: data, isLoading, isError }}
    >
      {children}
    </AuthContext.Provider>
  );
};
