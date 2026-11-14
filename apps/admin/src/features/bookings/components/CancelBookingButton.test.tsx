import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BookingType } from "@hotel-booking/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CancelBookingButton from "./CancelBookingButton";

const bookingsApi = vi.hoisted(() => ({ cancelBooking: vi.fn() }));

vi.mock("../api", () => bookingsApi);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const DAY_MS = 86_400_000;

const booking = (overrides: Partial<BookingType> = {}): BookingType =>
  ({
    _id: "booking-1",
    status: "confirmed",
    allowedTransitions: ["cancelling", "cancelled", "needs_review"],
    checkIn: new Date(Date.now() + 10 * DAY_MS),
    checkOut: new Date(Date.now() + 12 * DAY_MS),
    ...overrides,
  }) as BookingType;

const renderButton = (candidate: BookingType) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CancelBookingButton booking={candidate} />
    </QueryClientProvider>,
  );
};

describe("CancelBookingButton", () => {
  beforeEach(() => {
    bookingsApi.cancelBooking.mockReset().mockResolvedValue({ refundAmount: 0 });
  });

  it("offers cancellation for a needs_review booking that may still be cancelled", () => {
    renderButton(
      booking({
        status: "needs_review",
        allowedTransitions: ["cancelling", "confirmed", "cancelled"],
      }),
    );
    expect(screen.getByRole("button", { name: /cancel booking/i })).toBeInTheDocument();
  });

  it("hides the action when the state machine offers no cancellation", () => {
    renderButton(booking({ status: "cancelled", allowedTransitions: ["needs_review"] }));
    expect(screen.queryByRole("button", { name: /cancel booking/i })).not.toBeInTheDocument();
  });

  it("requires a reason and sends the trimmed text", async () => {
    renderButton(booking());
    fireEvent.click(screen.getByRole("button", { name: /cancel booking/i }));

    const confirm = screen.getByRole("button", { name: /confirm cancel/i });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: "  ab " } });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/reason/i), {
      target: { value: "  Guest called to cancel  " },
    });
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(bookingsApi.cancelBooking).toHaveBeenCalledWith("booking-1", "Guest called to cancel"),
    );
  });
});
