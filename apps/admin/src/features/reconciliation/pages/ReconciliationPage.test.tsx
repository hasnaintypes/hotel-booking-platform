import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { Discrepancy } from "@hotel-booking/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ReconciliationPage from "./ReconciliationPage";

const reconciliationApi = vi.hoisted(() => ({
  fetchDiscrepancies: vi.fn(),
  updateDiscrepancy: vi.fn(),
}));

vi.mock("../api", () => reconciliationApi);
vi.mock("@/features/auth/hooks/useAuth", () => ({
  default: () => ({ user: { _id: "admin-1" }, isLoggedIn: true }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const finding = (overrides: Partial<Discrepancy> = {}) =>
  ({
    id: "finding-1",
    dedupeKey: "payment_status_mismatch:1",
    kind: "payment_status_mismatch",
    status: "open",
    provider: "stripe",
    bookingId: null,
    paymentId: null,
    providerReference: null,
    details: { local: "paid", provider: "pending" },
    detectedAt: "2026-05-03T09:00:00.000Z",
    resolvedAt: null,
    resolution: null,
    assignedToUserId: null,
    assignedAt: null,
    assignedByUserId: null,
    resolvedByUserId: null,
    createdAt: "2026-05-03T09:00:00.000Z",
    updatedAt: "2026-05-03T09:00:00.000Z",
    ...overrides,
  }) as Discrepancy;

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ReconciliationPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe("ReconciliationPage", () => {
  beforeEach(() => {
    reconciliationApi.fetchDiscrepancies.mockReset().mockResolvedValue({
      data: [finding()],
      pageInfo: { nextCursor: null, hasMore: false },
    });
    reconciliationApi.updateDiscrepancy.mockReset().mockResolvedValue(finding());
  });

  it("renders open findings with their compared values", async () => {
    renderPage();

    expect(await screen.findByText(/local: paid/)).toBeInTheDocument();
    expect(screen.getByText(/unassigned/i)).toBeInTheDocument();
  });

  it("assigns the finding to the current admin", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /assign to me/i }));

    await waitFor(() =>
      expect(reconciliationApi.updateDiscrepancy).toHaveBeenCalledWith("finding-1", {
        assignedToUserId: "admin-1",
      }),
    );
  });

  it("closes a finding with a resolution", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /^resolve$/i }));

    const save = screen.getByRole("button", { name: /save resolution/i });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/resolution/i), {
      target: { value: "Refund issued in Stripe" },
    });
    fireEvent.click(save);

    await waitFor(() =>
      expect(reconciliationApi.updateDiscrepancy).toHaveBeenCalledWith("finding-1", {
        status: "resolved",
        resolution: "Refund issued in Stripe",
      }),
    );
  });
});
