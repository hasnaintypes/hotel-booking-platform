import apiClient, { authSession } from "@hotel-booking/api-client";
import type { UserType } from "@hotel-booking/types";
import { clearUserDetails } from "./auth-storage";

export type SignInPayload = {
  email: string;
  password: string;
};

type SignInResponse = {
  userId?: string;
  user?: Pick<UserType, "email" | "firstName" | "lastName" | "role">;
};

export const fetchCurrentUser = async (): Promise<UserType> => {
  const response = await apiClient.get("/api/v1/me");
  return response.data;
};

export const signIn = async (payload: SignInPayload): Promise<SignInResponse> => {
  const response = await apiClient.post<SignInResponse>("/api/v1/auth/login", payload);
  const { userId, user } = response.data;

  authSession.set();
  if (userId) localStorage.setItem("user_id", userId);
  if (user?.email) localStorage.setItem("user_email", user.email);
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ");
  if (name || user?.email) {
    localStorage.setItem("user_name", name || user?.email || "");
  }

  return response.data;
};

export const signOut = async () => {
  try {
    await apiClient.post("/api/v1/auth/logout");
  } finally {
    authSession.clear();
    clearUserDetails();
  }
};
