import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { BookingCreationType, UserType } from "@hotel-booking/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BookingForm from "./BookingForm";

const mocks = vi.hoisted(() => ({
  confirmPayment: vi.fn(),
  createBooking: vi.fn(),
}));

vi.mock("@stripe/react-stripe-js", () => ({
  useStripe: () => ({ confirmPayment: mocks.confirmPayment }),
  useElements: () => ({ getElement: () => ({}) }),
  PaymentElement: () => <div data-testid="payment-element" />,
  Elements: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/shared/lib/stripe", () => ({ stripePromise: Promise.resolve({}) }));

vi.mock("@/features/bookings/api", () => ({
  createBooking: mocks.createBooking,
}));

const user = {
  _id: "u1",
  email: "guest@example.com",
  firstName: "Gus",
  lastName: "Guest",
} as UserType;

const booking = {
  _id: "b1",
  publicReference: "ref_1",
  userId: "u1",
  hotelId: "h1",
  firstName: "Gus",
  lastName: "Guest",
  email: "guest@example.com",
  adultCount: 2,
  childCount: 0,
  checkIn: new Date("2030-01-01T00:00:00Z"),
  checkOut: new Date("2030-01-03T00:00:00Z"),
  totalCost: 250,
  status: "pending_payment",
  clientSecret: "secret_123",
} as BookingCreationType;

const onPaymentSubmitted = vi.fn();

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BookingForm
        currentUser={user}
        hotelId="h1"
        stay={{
          checkIn: new Date("2030-01-01T00:00:00Z"),
          checkOut: new Date("2030-01-03T00:00:00Z"),
          adultCount: 2,
          childCount: 0,
        }}
        onPaymentSubmitted={onPaymentSubmitted}
      />
    </QueryClientProvider>,
  );
}

const continueButton = () =>
  screen.getByRole("button", { name: /continue to payment|preparing payment/i });
const payButton = () => screen.getByRole("button", { name: /pay & confirm booking/i });
const succeeded = { paymentIntent: { id: "pi_123", status: "succeeded" } };

beforeEach(() => {
  mocks.confirmPayment.mockReset();
  mocks.createBooking.mockReset();
  onPaymentSubmitted.mockReset();
});

describe("BookingForm checkout (#55)", () => {
  it("creates the booking once with server-computed money before showing payment", async () => {
    mocks.createBooking.mockResolvedValue(booking);
    renderForm();

    fireEvent.click(continueButton());

    await waitFor(() => expect(mocks.createBooking).toHaveBeenCalledTimes(1));
    const payload = mocks.createBooking.mock.calls[0][0];
    expect(payload).toMatchObject({ hotelId: "h1", firstName: "Gus", lastName: "Guest" });
    expect(payload).not.toHaveProperty("totalCost");
    expect(payload).not.toHaveProperty("paymentIntentId");
    expect(await screen.findByTestId("payment-element")).toBeInTheDocument();
    expect(screen.getByText("£250.00")).toBeInTheDocument();
  });

  it("lets a declined card retry without creating a second booking", async () => {
    mocks.createBooking.mockResolvedValue(booking);
    mocks.confirmPayment
      .mockResolvedValueOnce({
        error: { type: "card_error", code: "card_declined", message: "Your card was declined." },
      })
      .mockResolvedValueOnce(succeeded);
    renderForm();

    fireEvent.click(continueButton());
    fireEvent.click(await screen.findByRole("button", { name: /pay & confirm booking/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Your card was declined.");
    expect(onPaymentSubmitted).not.toHaveBeenCalled();

    fireEvent.click(payButton());
    await waitFor(() => expect(mocks.confirmPayment).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onPaymentSubmitted).toHaveBeenCalledWith("ref_1"));
    expect(mocks.createBooking).toHaveBeenCalledTimes(1);
  });

  it("treats a network failure while confirming as unknown and never invites a retry", async () => {
    mocks.createBooking.mockResolvedValue(booking);
    mocks.confirmPayment.mockRejectedValue(new Error("offline"));
    renderForm();

    fireEvent.click(continueButton());
    fireEvent.click(await screen.findByRole("button", { name: /pay & confirm booking/i }));

    await waitFor(() => expect(onPaymentSubmitted).toHaveBeenCalledWith("ref_1"));
    expect(await screen.findByText(/please don't pay again/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /pay & confirm booking/i })).toBeDisabled();
    expect(mocks.confirmPayment).toHaveBeenCalledTimes(1);
  });

  it("locks the form while a payment is processing", async () => {
    mocks.createBooking.mockResolvedValue(booking);
    mocks.confirmPayment.mockResolvedValue({
      paymentIntent: { id: "pi_123", status: "processing" },
    });
    renderForm();

    fireEvent.click(continueButton());
    fireEvent.click(await screen.findByRole("button", { name: /pay & confirm booking/i }));

    await waitFor(() => expect(onPaymentSubmitted).toHaveBeenCalledWith("ref_1"));
    expect(screen.getByRole("button", { name: /pay & confirm booking/i })).toBeDisabled();
  });

  it("ignores a second payment click while the confirmation is in flight", async () => {
    mocks.createBooking.mockResolvedValue(booking);
    let settle!: (value: unknown) => void;
    mocks.confirmPayment.mockReturnValue(new Promise((resolve) => (settle = resolve)));
    renderForm();

    fireEvent.click(continueButton());
    const button = await screen.findByRole("button", { name: /pay & confirm booking/i });
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    fireEvent.click(button);
    expect(mocks.confirmPayment).toHaveBeenCalledTimes(1);

    settle(succeeded);
    await waitFor(() => expect(onPaymentSubmitted).toHaveBeenCalledTimes(1));
  });

  it("sends a 3-D Secure return URL that carries the booking reference", async () => {
    mocks.createBooking.mockResolvedValue(booking);
    mocks.confirmPayment.mockResolvedValue(succeeded);
    renderForm();

    fireEvent.click(continueButton());
    fireEvent.click(await screen.findByRole("button", { name: /pay & confirm booking/i }));

    await waitFor(() => expect(mocks.confirmPayment).toHaveBeenCalledTimes(1));
    expect(mocks.confirmPayment.mock.calls[0][0]).toMatchObject({
      redirect: "if_required",
      confirmParams: {
        return_url: "http://localhost:3000/hotel/h1/booking/return?reference=ref_1",
      },
    });
  });

  it("does not submit the details form twice while the booking is being created", async () => {
    let settle!: (value: unknown) => void;
    mocks.createBooking.mockReturnValue(new Promise((resolve) => (settle = resolve)));
    renderForm();

    fireEvent.click(continueButton());
    await waitFor(() => expect(continueButton()).toBeDisabled());
    fireEvent.click(continueButton());
    expect(mocks.createBooking).toHaveBeenCalledTimes(1);

    settle(booking);
    await waitFor(() => expect(screen.getByTestId("payment-element")).toBeInTheDocument());
  });
});
