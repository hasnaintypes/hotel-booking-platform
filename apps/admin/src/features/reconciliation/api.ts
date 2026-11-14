import apiClient from "@hotel-booking/api-client";
import type {
  DiscrepancyKind,
  DiscrepancyStatus,
  ReconciliationDiscrepancyType,
} from "@hotel-booking/types";

export type DiscrepancyFilters = {
  status?: DiscrepancyStatus;
  kind?: DiscrepancyKind;
  assignedToUserId?: string;
};

export type DiscrepancyUpdate = {
  status?: "resolved" | "ignored";
  resolution?: string;
  assignedToUserId?: string | null;
};

export const fetchDiscrepancies = async (
  filters: DiscrepancyFilters = {},
): Promise<ReconciliationDiscrepancyType[]> => {
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
): Promise<ReconciliationDiscrepancyType> => {
  const response = await apiClient.patch(
    `/api/v1/admin/reconciliation/discrepancies/${id}`,
    update,
  );
  return response.data;
};
