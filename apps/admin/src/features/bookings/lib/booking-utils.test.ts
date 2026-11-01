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
  it("allows pending and confirmed future bookings", () => {
    expect(isBookingCancellable(booking({ status: "pending" }))).toBe(true);
    expect(isBookingCancellable(booking({ status: "confirmed" }))).toBe(true);
  });

  it("rejects terminal statuses", () => {
    for (const status of ["cancelled", "completed", "refunded"] as const) {
      expect(isBookingCancellable(booking({ status }))).toBe(false);
    }
  });

  it("rejects stays whose check-in has passed", () => {
    expect(isBookingCancellable(booking({ checkIn: new Date(Date.now() - 86_400_000) }))).toBe(
      false,
    );
  });

  it("treats a missing status as pending", () => {
    expect(isBookingCancellable(booking({ status: undefined }))).toBe(true);
  });
});
