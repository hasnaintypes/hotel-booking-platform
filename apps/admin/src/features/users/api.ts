import apiClient from "@hotel-booking/api-client";
import type { UserType } from "@hotel-booking/types";

export type AdminRole = "user" | "admin" | "hotel_owner";

export const fetchUsers = async (): Promise<UserType[]> => {
  const response = await apiClient.get("/api/users");
  return response.data;
};

export const updateUserRole = async (userId: string, role: AdminRole): Promise<UserType> => {
  const response = await apiClient.patch(`/api/users/${userId}/role`, {
    role,
  });
  return response.data;
};
