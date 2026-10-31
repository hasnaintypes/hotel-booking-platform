import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { PaymentIntentResponse, UserType } from "@hotel-booking/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/shared/context/ToastContext";
import BookingForm from "./BookingForm";

const mocks = vi.hoisted(() => ({
  confirmCardPayment: vi.fn(),
  createRoomBooking: vi.fn(),
}));

vi.mock("@stripe/react-stripe-js", () => ({
  useStripe: () => ({ confirmCardPayment: mocks.confirmCardPayment }),
  useElements: () => ({ getElement: () => ({}) }),
  CardElement: () => <div data-testid="card-element" />,
}));

vi.mock("@/features/bookings/api", () => ({
  createRoomBooking: mocks.createRoomBooking,
}));

vi.mock("@/features/hotels/hooks/useSearchContext", () => ({
  default: () => ({
    adultCount: 2,
    childCount: 0,
    checkIn: new Date("2030-01-01T00:00:00Z"),
    checkOut: new Date("2030-01-03T00:00:00Z"),
  }),
}));

const user = {
  _id: "u1",
  email: "guest@example.com",
  firstName: "Gus",
  lastName: "Guest",
} as UserType;

const paymentIntent: PaymentIntentResponse = {
  paymentIntentId: "pi_original",
  clientSecret: "secret_123",
  totalCost: 200,
};

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/hotel/h1/booking"]}>
          <Routes>
            <Route
              path="/hotel/:hotelId/booking"
              element={<BookingForm currentUser={user} paymentIntent={paymentIntent} />}
            />
            <Route path="/my-bookings" element={<div>My bookings page</div>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const submitButton = () => screen.getByRole("button", { name: /confirm booking|processing/i });
const succeeded = { paymentIntent: { id: "pi_123", status: "succeeded" } };

beforeEach(() => {
  mocks.confirmCardPayment.mockReset();
  mocks.createRoomBooking.mockReset();
});

describe("BookingForm checkout", () => {
  it("shows a declined card and lets the guest retry without reloading", async () => {
    mocks.confirmCardPayment
      .mockResolvedValueOnce({
        error: { type: "card_error", code: "card_declined", message: "Your card was declined." },
      })
      .mockResolvedValueOnce(succeeded);
    mocks.createRoomBooking.mockResolvedValue({});
    renderForm();

    fireEvent.click(submitButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("Your card was declined.");
    expect(mocks.createRoomBooking).not.toHaveBeenCalled();
    await waitFor(() => expect(submitButton()).toBeEnabled());

    fireEvent.click(submitButton());
    await waitFor(() => expect(mocks.createRoomBooking).toHaveBeenCalledTimes(1));
    // TanStack Query passes a context object as a second argument; only the payload matters here.
    expect(mocks.createRoomBooking.mock.calls[0][0]).toMatchObject({
      paymentIntentId: "pi_123",
      hotelId: "h1",
    });
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("explains a payment that was not completed (requires_action)", async () => {
    mocks.confirmCardPayment.mockResolvedValue({
      paymentIntent: { id: "pi_123", status: "requires_action" },
    });
    renderForm();

    fireEvent.click(submitButton());
    expect(await screen.findByRole("alert")).toHaveTextContent(/wasn't completed/);
    expect(mocks.createRoomBooking).not.toHaveBeenCalled();
    await waitFor(() => expect(submitButton()).toBeEnabled());
  });

  it("explains a network failure while confirming the card", async () => {
    mocks.confirmCardPayment.mockRejectedValue(new Error("offline"));
    renderForm();

    fireEvent.click(submitButton());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /couldn't reach the payment service/,
    );
    expect(mocks.createRoomBooking).not.toHaveBeenCalled();
    await waitFor(() => expect(submitButton()).toBeEnabled());
  });

  it("locks the form while a payment is still processing", async () => {
    mocks.confirmCardPayment.mockResolvedValue({
      paymentIntent: { id: "pi_123", status: "processing" },
    });
    renderForm();

    fireEvent.click(submitButton());
    expect(await screen.findByRole("alert")).toHaveTextContent(/don't pay again/);
    await waitFor(() => expect(submitButton()).toBeDisabled());
  });

  it("books the room after a successful payment", async () => {
    mocks.confirmCardPayment.mockResolvedValue(succeeded);
    mocks.createRoomBooking.mockResolvedValue({});
    renderForm();

    fireEvent.click(submitButton());
    await waitFor(() => expect(mocks.createRoomBooking).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the payment reference when the booking fails after the card was charged", async () => {
    mocks.confirmCardPayment.mockResolvedValue(succeeded);
    mocks.createRoomBooking.mockRejectedValue(new Error("server error"));
    renderForm();

    fireEvent.click(submitButton());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/payment went through/i);
    expect(alert).toHaveTextContent("pi_123");
    expect(screen.getByRole("link", { name: "My Bookings" })).toHaveAttribute(
      "href",
      "/my-bookings",
    );

    // The guest cannot be charged a second time.
    await waitFor(() => expect(submitButton()).toBeDisabled());
    fireEvent.click(submitButton());
    expect(mocks.confirmCardPayment).toHaveBeenCalledTimes(1);
  });

  it("ignores a second click while the payment is in flight", async () => {
    let settle!: (value: unknown) => void;
    mocks.confirmCardPayment.mockReturnValue(new Promise((resolve) => (settle = resolve)));
    mocks.createRoomBooking.mockResolvedValue({});
    renderForm();

    fireEvent.click(submitButton());
    await waitFor(() => expect(submitButton()).toBeDisabled());
    fireEvent.click(submitButton());
    expect(mocks.confirmCardPayment).toHaveBeenCalledTimes(1);

    settle(succeeded);
    await waitFor(() => expect(mocks.createRoomBooking).toHaveBeenCalledTimes(1));
  });
});
