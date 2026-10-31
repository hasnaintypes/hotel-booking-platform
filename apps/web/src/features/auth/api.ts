import axiosInstance, { getApiBaseUrl } from "@hotel-booking/api-client";
import { queryClient } from "@hotel-booking/api-client";
import type { UserType } from "@hotel-booking/types";
import { authKeys } from "@/shared/lib/query-keys";
import { clearSessionToken, setSessionToken } from "./auth-storage";
import type { RegisterFormData, SignInFormData } from "./types";

export { getApiBaseUrl };

export const fetchCurrentUser = async (): Promise<UserType> => {
  const response = await axiosInstance.get("/api/users/me");
  return response.data;
};

export const register = async (formData: RegisterFormData) => {
  const response = await axiosInstance.post("/api/users/register", formData);
  return response.data;
};

export const signIn = async (formData: SignInFormData) => {
  const response = await axiosInstance.post("/api/auth/login", formData);

  // Store JWT token from response body in localStorage
  const token = response.data?.token;
  if (token) {
    setSessionToken(token);
  }

  // Store user info for profile avatar / UsernameMenu
  if (response.data?.userId) {
    localStorage.setItem("user_id", response.data.userId);
  }
  if (response.data?.user) {
    const { email, firstName, lastName } = response.data.user;
    if (email) localStorage.setItem("user_email", email);
    const name = [firstName, lastName].filter(Boolean).join(" ") || email;
    if (name) localStorage.setItem("user_name", name);
  }

  // Refresh current-user cache so isLoggedIn flips without a full reload.
  try {
    await queryClient.invalidateQueries({ queryKey: authKeys.currentUser() });
  } catch {
    // Token stored — UI still works if the refresh races; do not spam console.
  }

  return response.data;
};

/** Clears JWT keys when session is invalid */
export const clearAuthStorage = () => {
  clearSessionToken();
  localStorage.removeItem("user_id");
  localStorage.removeItem("user_email");
  localStorage.removeItem("user_name");
  localStorage.removeItem("user_image");
};

export const signOut = async () => {
  const response = await axiosInstance.post("/api/auth/logout");

  clearAuthStorage();

  return response.data;
};

// Development utility to clear all browser storage
export const clearAllStorage = () => {
  localStorage.clear();
  clearSessionToken();
  sessionStorage.clear();
  document.cookie.split(";").forEach((c) => {
    document.cookie = c
      .replace(/^ +/, "")
      .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
  });
};
