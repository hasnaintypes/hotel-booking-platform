import apiClient from "@hotel-booking/api-client";
import type {
  AdminUserListItem,
  CursorPage,
  CursorPageQuery,
  PublicUser,
} from "@hotel-booking/contracts";

export type AdminRole = "user" | "admin";

export const fetchUsers = async (
  params: CursorPageQuery = {},
): Promise<CursorPage<AdminUserListItem>> => {
  const response = await apiClient.get("/api/v1/admin/users", { params });
  return response.data;
};

export const updateUserRole = async (userId: string, role: AdminRole): Promise<PublicUser> => {
  const response = await apiClient.patch(`/api/v1/admin/users/${userId}`, {
    role,
  });
  return response.data;
};
