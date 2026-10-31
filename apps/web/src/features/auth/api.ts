import axiosInstance, { getApiBaseUrl } from "@hotel-booking/api-client";
import { queryClient } from "@hotel-booking/api-client";
import type { UserType } from "@hotel-booking/types";
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
    localStorage.setItem("session_id", token);
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

  // Refresh validateToken cache so isLoggedIn flips without full reload
  try {
    await validateToken();
    await queryClient.invalidateQueries({ queryKey: ["validateToken"] });
    await queryClient.refetchQueries({ queryKey: ["validateToken"] });
  } catch {
    // Token stored — UI still works if validate races; do not spam console
  }

  return response.data;
};

/** Clears JWT keys when session is invalid */
export const clearAuthStorage = () => {
  localStorage.removeItem("session_id");
  localStorage.removeItem("user_id");
  localStorage.removeItem("user_email");
  localStorage.removeItem("user_name");
  localStorage.removeItem("user_image");
};

export const validateToken = async () => {
  const token = localStorage.getItem("session_id");
  // No JWT — guest; skip network (callers should also gate with enabled)
  if (!token) {
    return null;
  }

  try {
    const response = await axiosInstance.get("/api/auth/validate-token");
    return response.data;
  } catch (error: unknown) {
    const status = (error as { response?: { status?: number } })?.response
      ?.status;
    if (status === 401) {
      clearAuthStorage();
      throw new Error("Token invalid", { cause: error });
    }
    throw new Error("Token validation failed", { cause: error });
  }
};

export const signOut = async () => {
  const response = await axiosInstance.post("/api/auth/logout");

  // Clear localStorage (JWT tokens and user info)
  localStorage.removeItem("session_id");
  localStorage.removeItem("user_id");
  localStorage.removeItem("user_email");
  localStorage.removeItem("user_name");
  localStorage.removeItem("user_image");

  return response.data;
};

// Development utility to clear all browser storage
export const clearAllStorage = () => {
  localStorage.clear();
  sessionStorage.clear();
  document.cookie.split(";").forEach((c) => {
    document.cookie = c
      .replace(/^ +/, "")
      .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
  });
};
