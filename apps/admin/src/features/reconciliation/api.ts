import apiClient from "@hotel-booking/api-client";
import type { CursorPage, Discrepancy, DiscrepancyListQuery } from "@hotel-booking/contracts";

export type DiscrepancyUpdate = {
  status?: "resolved" | "ignored";
  resolution?: string;
  assignedToUserId?: string | null;
};

export const fetchDiscrepancies = async (
  filters: DiscrepancyListQuery = {},
): Promise<CursorPage<Discrepancy>> => {
  const response = await apiClient.get("/api/v1/admin/reconciliation/discrepancies", {
    params: Object.fromEntries(
      Object.entries(filters).filter(([, value]) => value !== undefined && value !== ""),
    ),
  });
  return response.data;
};

export const updateDiscrepancy = async (
  id: string,
  update: DiscrepancyUpdate,
): Promise<Discrepancy> => {
  const response = await apiClient.patch(
    `/api/v1/admin/reconciliation/discrepancies/${id}`,
    update,
  );
  return response.data;
};
