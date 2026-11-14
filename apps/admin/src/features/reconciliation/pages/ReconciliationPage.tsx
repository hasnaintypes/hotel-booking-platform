import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiErrorMessage } from "@hotel-booking/api-client";
import type {
  DiscrepancyKind,
  DiscrepancyStatus,
  ReconciliationDiscrepancyType,
} from "@hotel-booking/types";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@hotel-booking/ui";
import { toast } from "sonner";
import useAuth from "@/features/auth/hooks/useAuth";
import { adminKeys } from "@/shared/lib/query-keys";
import { invalidateAdminReconciliation } from "@/shared/lib/query-invalidation";
import { fetchDiscrepancies, updateDiscrepancy, type DiscrepancyUpdate } from "../api";

const KINDS: DiscrepancyKind[] = [
  "payment_status_mismatch",
  "payment_amount_mismatch",
  "refund_mismatch",
  "local_without_provider",
  "provider_missing",
  "provider_without_local",
  "ledger_mismatch",
];

const STATUSES: DiscrepancyStatus[] = ["open", "resolved", "ignored"];

const statusClass = (status: DiscrepancyStatus) => {
  switch (status) {
    case "open":
      return "bg-purple-100 text-purple-800";
    case "resolved":
      return "bg-green-100 text-green-800";
    case "ignored":
      return "bg-slate-100 text-slate-700";
  }
};

const formatDateTime = (value?: Date | string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
};

const detailsSummary = (details: Record<string, unknown>) => {
  const entries = Object.entries(details).filter(
    ([, value]) => value !== null && value !== undefined && typeof value !== "object",
  );
  return entries
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" · ");
};

const DiscrepancyRow = ({
  discrepancy,
  currentUserId,
}: {
  discrepancy: ReconciliationDiscrepancyType;
  currentUserId?: string;
}) => {
  const queryClient = useQueryClient();
  const [closing, setClosing] = useState<"resolved" | "ignored" | null>(null);
  const [resolution, setResolution] = useState("");

  const mutation = useMutation({
    mutationFn: (update: DiscrepancyUpdate) => updateDiscrepancy(discrepancy.id, update),
    onSuccess: async (_data, update) => {
      await invalidateAdminReconciliation(queryClient);
      toast.success(
        update.status
          ? `Finding ${update.status}`
          : update.assignedToUserId
            ? "Finding assigned"
            : "Assignment cleared",
      );
      setClosing(null);
      setResolution("");
    },
    onError: (error) => {
      toast.error("Could not update finding", {
        description: apiErrorMessage(error, "The discrepancy could not be updated"),
      });
    },
  });

  const assignedToMe = Boolean(currentUserId && discrepancy.assignedToUserId === currentUserId);
  const resolutionIsValid = resolution.trim().length >= 3;

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-800">
              {discrepancy.kind.replace(/_/g, " ")}
            </span>
            <Badge className={statusClass(discrepancy.status)}>{discrepancy.status}</Badge>
            <Badge variant="outline">{discrepancy.provider}</Badge>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Detected {formatDateTime(discrepancy.detectedAt)}
            {discrepancy.assignedToUserId
              ? ` · assigned to ${assignedToMe ? "you" : discrepancy.assignedToUserId}`
              : " · unassigned"}
          </p>
          {detailsSummary(discrepancy.details) && (
            <p className="mt-1 text-xs text-slate-600">{detailsSummary(discrepancy.details)}</p>
          )}
          {discrepancy.bookingId && (
            <Link
              to={`/bookings/${discrepancy.bookingId}`}
              className="mt-1 inline-block text-xs font-medium text-primary-700 hover:underline"
            >
              Open booking
            </Link>
          )}
        </div>

        {discrepancy.status === "open" && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={mutation.isPending}
              onClick={() =>
                mutation.mutate({ assignedToUserId: assignedToMe ? null : (currentUserId ?? null) })
              }
            >
              {assignedToMe ? "Unassign me" : "Assign to me"}
            </Button>
            <Button type="button" size="sm" onClick={() => setClosing("resolved")}>
              Resolve
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setClosing("ignored")}>
              Ignore
            </Button>
          </div>
        )}
      </div>

      {discrepancy.status !== "open" && discrepancy.resolution && (
        <p className="mt-2 text-sm text-slate-700">{discrepancy.resolution}</p>
      )}

      {closing && (
        <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <label className="block text-sm font-medium text-gray-700">
            {closing === "resolved" ? "Resolution" : "Why is this safe to ignore?"} (required)
            <textarea
              className="mt-1 block w-full rounded-xl border border-gray-300 p-2"
              rows={2}
              value={resolution}
              onChange={(event) => setResolution(event.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!resolutionIsValid || mutation.isPending}
              onClick={() => mutation.mutate({ status: closing, resolution: resolution.trim() })}
            >
              {mutation.isPending
                ? "Saving…"
                : closing === "resolved"
                  ? "Save resolution"
                  : "Ignore finding"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={mutation.isPending}
              onClick={() => {
                setClosing(null);
                setResolution("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </li>
  );
};

const ReconciliationPage = () => {
  const { user } = useAuth();
  const [status, setStatus] = useState<DiscrepancyStatus | "">("open");
  const [kind, setKind] = useState<DiscrepancyKind | "">("");

  const filters = useMemo(
    () => ({
      ...(status ? { status } : {}),
      ...(kind ? { kind } : {}),
    }),
    [status, kind],
  );

  const discrepanciesQuery = useQuery({
    queryKey: [...adminKeys.reconciliation, filters],
    queryFn: () => fetchDiscrepancies(filters),
  });

  const openCount = (discrepanciesQuery.data ?? []).filter(
    (discrepancy) => discrepancy.status === "open",
  ).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-medium text-gray-700 md:text-2xl">Reconciliation</h1>
        <p className="text-sm text-gray-500">
          Differences between local payment state and Stripe, plus ledger mismatches.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-gray-700">
          Status
          <select
            className="mt-1 block rounded-xl border border-gray-300 bg-white p-2"
            value={status}
            onChange={(event) => setStatus(event.target.value as DiscrepancyStatus | "")}
          >
            <option value="">All statuses</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-gray-700">
          Kind
          <select
            className="mt-1 block rounded-xl border border-gray-300 bg-white p-2"
            value={kind}
            onChange={(event) => setKind(event.target.value as DiscrepancyKind | "")}
          >
            <option value="">All kinds</option>
            {KINDS.map((value) => (
              <option key={value} value={value}>
                {value.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <p className="text-sm text-slate-600">
          Showing {discrepanciesQuery.data?.length ?? 0} finding
          {(discrepanciesQuery.data?.length ?? 0) === 1 ? "" : "s"}
          {status === "open" ? ` (${openCount} open)` : ""}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Findings</CardTitle>
        </CardHeader>
        <CardContent>
          {discrepanciesQuery.isLoading ? (
            <div className="h-24 animate-pulse rounded-xl bg-slate-200" />
          ) : discrepanciesQuery.isError ? (
            <p className="text-sm text-red-600">Could not load findings.</p>
          ) : (discrepanciesQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">No findings match these filters.</p>
          ) : (
            <ul className="space-y-3">
              {(discrepanciesQuery.data ?? []).map((discrepancy) => (
                <DiscrepancyRow
                  key={discrepancy.id}
                  discrepancy={discrepancy}
                  currentUserId={user?._id}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ReconciliationPage;
