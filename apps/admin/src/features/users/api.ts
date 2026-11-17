import apiClient from "@hotel-booking/api-client";
import type { CursorPage, ListQuery, UserType } from "@hotel-booking/types";

export type AdminRole = "user" | "admin";

export const fetchUsers = async (params: ListQuery = {}): Promise<CursorPage<UserType>> => {
  const response = await apiClient.get("/api/v1/admin/users", { params });
  return response.data;
};

export const updateUserRole = async (userId: string, role: AdminRole): Promise<UserType> => {
  const response = await apiClient.patch(`/api/v1/admin/users/${userId}`, {
    role,
  });
  return response.data;
};
