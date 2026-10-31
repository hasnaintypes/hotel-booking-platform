import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button } from "@hotel-booking/ui";
import { toast } from "sonner";
import { getErrorStatus } from "@/shared/lib/api-error";
import { adminKeys } from "@/shared/lib/query-keys";
import { invalidateAdminInsights } from "@/shared/lib/query-invalidation";
import { createRollup, fetchInsightsDashboard, fetchRollups, suggestInsightsCopy } from "../api";

const DashboardPage = () => {
  const queryClient = useQueryClient();
  const [notepad, setNotepad] = useState("");
  const [draft, setDraft] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [aiDisabled, setAiDisabled] = useState(false);

  const insightsQuery = useQuery({
    queryKey: adminKeys.insights,
    queryFn: fetchInsightsDashboard,
  });

  const rollupsQuery = useQuery({
    queryKey: adminKeys.rollups,
    queryFn: fetchRollups,
  });

  const captureMutation = useMutation({
    mutationFn: createRollup,
    onSuccess: async () => {
      await invalidateAdminInsights(queryClient);
      toast.success("Rollup saved", {
        description: "Live figures captured to business insights rollups.",
      });
    },
    onError: () => {
      toast.error("Rollup failed", {
        description: "Could not create a business insights rollup.",
      });
    },
  });

  const suggestMutation = useMutation({
    mutationFn: () => suggestInsightsCopy(JSON.stringify(insightsQuery.data?.overview || {})),
    onSuccess: (data) => {
      setDraft(data.draft);
      setProvider(data.provider);
      setAiDisabled(false);
    },
    onError: (error) => {
      if (getErrorStatus(error) === 503) {
        setAiDisabled(true);
        toast.info("AI assist unavailable", {
          description: "Enable AI_ASSIST_ENABLED on the server.",
        });
        return;
      }
      toast.error("Suggestion failed", {
        description: "Could not generate a draft. Please try again.",
      });
    },
  });

  const overview = insightsQuery.data?.overview;
  const rollups = rollupsQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-medium text-slate-900 md:text-2xl">Dashboard</h1>
          <p className="text-sm text-slate-500">
            Live hotel-domain figures and business insights rollups
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!aiDisabled && (
            <Button
              type="button"
              variant="outline"
              onClick={() => suggestMutation.mutate()}
              disabled={suggestMutation.isPending || insightsQuery.isLoading}
            >
              {suggestMutation.isPending ? "Suggesting…" : "Suggest insights blurb"}
            </Button>
          )}
          <Button onClick={() => captureMutation.mutate()} disabled={captureMutation.isPending}>
            {captureMutation.isPending ? "Capturing…" : "Capture rollup"}
          </Button>
        </div>
      </div>

      {draft && (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">
            Insights draft ({provider}) — apply to the notepad before editing
          </p>
          <p className="whitespace-pre-line text-sm text-slate-800">{draft}</p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setNotepad(draft);
                setDraft(null);
                toast.success("Draft applied to notepad");
              }}
            >
              Apply to notepad
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(null)}>
              Discard
            </Button>
          </div>
        </div>
      )}

      <textarea
        rows={3}
        value={notepad}
        onChange={(event) => setNotepad(event.target.value)}
        placeholder="Local notepad for AI insights copy (not persisted)"
        className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm"
      />

      {insightsQuery.isLoading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="h-24 animate-pulse rounded-xl bg-slate-200" />
          ))}
        </div>
      ) : insightsQuery.isError ? (
        <div className="rounded-xl border border-red-200 bg-white p-4">
          <p className="text-sm text-red-700">Could not load dashboard figures.</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={() => insightsQuery.refetch()}
          >
            Retry
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            ["Hotels", overview?.totalHotels],
            ["Users", overview?.totalUsers],
            ["Bookings", overview?.totalBookings],
            [
              "Revenue",
              overview?.totalRevenue != null
                ? `£${Number(overview.totalRevenue).toLocaleString()}`
                : "—",
            ],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="mt-1 text-lg font-medium text-slate-900 md:text-2xl">{value ?? "—"}</p>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-medium text-slate-900">Recent rollups</h2>
        {rollupsQuery.isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((item) => (
              <div key={item} className="h-12 animate-pulse rounded bg-slate-100" />
            ))}
          </div>
        ) : rollupsQuery.isError ? (
          <div className="space-y-2">
            <p className="text-sm text-red-600">
              Failed to load rollups. Retry or check network / extensions.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => rollupsQuery.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : !rollups?.length ? (
          <p className="text-sm text-slate-500">
            No rollups yet. Capture one to persist live business figures.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rollups.slice(0, 10).map((rollup) => (
              <li key={rollup._id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <span className="font-medium text-slate-800">
                  {new Date(rollup.date).toLocaleString()}
                </span>
                <Badge variant="outline">{rollup.metrics.totalBookings} bookings</Badge>
                <Badge variant="outline">
                  £{Number(rollup.metrics.totalRevenue).toLocaleString()}
                </Badge>
                <Badge variant="outline">cancel {rollup.metrics.cancellationRate}%</Badge>
                <Badge variant="outline">rating {rollup.metrics.averageRating}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default DashboardPage;
