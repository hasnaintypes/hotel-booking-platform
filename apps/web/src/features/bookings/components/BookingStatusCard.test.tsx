import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { BookingStatus, BookingType } from "@hotel-booking/types";
import { describe, expect, it, vi } from "vitest";
import BookingStatusCard from "./BookingStatusCard";

const bookingOf = (status: BookingStatus): BookingType =>
  ({
    _id: "b1",
    publicReference: "ref_1",
    userId: "u1",
    hotelId: "h1",
    firstName: "Gus",
    lastName: "Guest",
    email: "guest@example.com",
    adultCount: 1,
    childCount: 0,
    checkIn: new Date("2030-01-01T00:00:00Z"),
    checkOut: new Date("2030-01-03T00:00:00Z"),
    totalCost: 250,
    status,
  }) as BookingType;

const renderCard = (props: Parameters<typeof BookingStatusCard>[0]) =>
  render(
    <MemoryRouter>
      <BookingStatusCard {...props} />
    </MemoryRouter>,
  );

describe("BookingStatusCard", () => {
  it("shows a confirmed booking with its reference and total", () => {
    renderCard({ booking: bookingOf("confirmed") });

    expect(screen.getByText("Booking confirmed")).toBeInTheDocument();
    expect(screen.getByText("Confirmed")).toBeInTheDocument();
    expect(screen.getByText("ref_1")).toBeInTheDocument();
    expect(screen.getByText("£250.00")).toBeInTheDocument();
  });

  it("says not to pay again while the booking is confirming", () => {
    renderCard({ booking: bookingOf("authorized") });

    expect(screen.getByText("Confirming your booking")).toBeInTheDocument();
    expect(screen.getByText(/please don't pay again/i)).toBeInTheDocument();
    expect(screen.getByText(/checking again automatically/i)).toBeInTheDocument();
  });

  it("treats needs_review as terminal and warns against another payment", () => {
    renderCard({ booking: bookingOf("needs_review"), onStartNew: vi.fn() });

    expect(screen.getByText("Payment needs review")).toBeInTheDocument();
    expect(screen.getByText(/please don't pay again/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start a new booking/i })).toBeInTheDocument();
  });

  it("offers a fresh checkout after an expired booking", () => {
    renderCard({ booking: bookingOf("expired"), onStartNew: vi.fn() });

    expect(screen.getByText("Payment window expired")).toBeInTheDocument();
    expect(screen.getByText(/no charge was taken/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start a new booking/i })).toBeInTheDocument();
  });

  it("shows a safe failure when polling cannot reach the API", () => {
    renderCard({ reference: "ref_1", isError: true });

    expect(screen.getByText("Still checking your booking")).toBeInTheDocument();
    expect(screen.getByText(/please don't pay again/i)).toBeInTheDocument();
  });
});
