import type { BookingType } from "@hotel-booking/types";
import { describe, expect, it } from "vitest";
import { isBookingCancellable } from "@hotel-booking/types";

const booking = (overrides: Partial<BookingType> = {}): BookingType =>
  ({
    _id: "booking-1",
    status: "confirmed",
    checkIn: new Date(Date.now() + 86_400_000),
    ...overrides,
  }) as BookingType;

describe("isBookingCancellable", () => {
  it("allows upcoming pre-terminal bookings", () => {
    for (const status of ["pending_payment", "authorized", "confirming", "confirmed"] as const) {
      expect(isBookingCancellable(booking({ status }))).toBe(true);
    }
  });

  it("rejects terminal and in-progress statuses", () => {
    for (const status of [
      "cancelling",
      "cancelled",
      "failed",
      "expired",
      "needs_review",
    ] as const) {
      expect(isBookingCancellable(booking({ status }))).toBe(false);
    }
  });

  it("rejects stays whose check-in has passed", () => {
    expect(isBookingCancellable(booking({ checkIn: new Date(Date.now() - 86_400_000) }))).toBe(
      false,
    );
  });

  it("rejects a booking with no status", () => {
    expect(isBookingCancellable(booking({ status: undefined }))).toBe(false);
  });
});
