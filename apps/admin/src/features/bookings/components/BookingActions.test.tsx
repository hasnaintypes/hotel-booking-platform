import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BookingType } from "@hotel-booking/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BookingActions from "./BookingActions";

const bookingsApi = vi.hoisted(() => ({
  retryBooking: vi.fn(),
  markBookingReviewed: vi.fn(),
}));

vi.mock("../api", () => bookingsApi);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const booking = (status: BookingType["status"]): BookingType =>
  ({
    _id: "booking-1",
    status,
    checkIn: new Date(Date.now() + 86_400_000),
  }) as BookingType;

const renderActions = (status: BookingType["status"]) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BookingActions booking={booking(status)} />
    </QueryClientProvider>,
  );
};

describe("BookingActions", () => {
  beforeEach(() => {
    bookingsApi.retryBooking.mockReset().mockResolvedValue({});
    bookingsApi.markBookingReviewed.mockReset().mockResolvedValue({});
  });

  it("offers no manual action outside needs_review", () => {
    renderActions("confirmed");
    expect(screen.getByText(/no manual actions/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry payment/i })).not.toBeInTheDocument();
  });

  it("requires a written reason before enabling the actions", () => {
    renderActions("needs_review");

    const retry = screen.getByRole("button", { name: /retry payment/i });
    const review = screen.getByRole("button", { name: /mark reviewed/i });
    expect(retry).toBeDisabled();
    expect(review).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: "  ab " } });
    expect(retry).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/reason/i), {
      target: { value: "Stripe shows the charge" },
    });
    expect(retry).toBeEnabled();
    expect(review).toBeEnabled();
  });

  it("retries the payment with the trimmed reason", async () => {
    renderActions("needs_review");
    fireEvent.change(screen.getByLabelText(/reason/i), {
      target: { value: "  Stripe shows the charge  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /retry payment/i }));

    await waitFor(() =>
      expect(bookingsApi.retryBooking).toHaveBeenCalledWith("booking-1", "Stripe shows the charge"),
    );
  });

  it("marks the booking reviewed with the reason", async () => {
    renderActions("needs_review");
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: "Supplier confirmed" } });
    fireEvent.click(screen.getByRole("button", { name: /mark reviewed/i }));

    await waitFor(() =>
      expect(bookingsApi.markBookingReviewed).toHaveBeenCalledWith(
        "booking-1",
        "Supplier confirmed",
      ),
    );
  });
});
