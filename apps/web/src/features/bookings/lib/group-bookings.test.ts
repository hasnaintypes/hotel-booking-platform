import type { BookingType } from "@hotel-booking/types";
import { describe, expect, it } from "vitest";
import { groupBookingsByHotel, summarizeBookings } from "./group-bookings";

const booking = (overrides: Partial<BookingType> = {}): BookingType =>
  ({
    _id: "booking-1",
    hotelId: "hotel-1",
    totalCost: 120,
    ...overrides,
  }) as BookingType;

describe("groupBookingsByHotel", () => {
  it("groups rows by hotel while preserving server order", () => {
    const groups = groupBookingsByHotel([
      booking({ _id: "b1", hotelId: "hotel-1" }),
      booking({ _id: "b2", hotelId: "hotel-2" }),
      booking({ _id: "b3", hotelId: "hotel-1" }),
    ]);

    expect(groups.map((group) => group.hotelId)).toEqual(["hotel-1", "hotel-2"]);
    expect(groups[0].bookings.map((row) => row._id)).toEqual(["b1", "b3"]);
    expect(groups[1].bookings.map((row) => row._id)).toEqual(["b2"]);
  });

  it("returns no groups for an empty page", () => {
    expect(groupBookingsByHotel([])).toEqual([]);
  });
});

describe("summarizeBookings", () => {
  it("counts rows, distinct hotels and the server-computed totals", () => {
    const summary = summarizeBookings([
      booking({ _id: "b1", hotelId: "hotel-1", totalCost: 120 }),
      booking({ _id: "b2", hotelId: "hotel-1", totalCost: 80 }),
      booking({ _id: "b3", hotelId: "hotel-2", totalCost: 50 }),
    ]);

    expect(summary).toEqual({ totalBookings: 3, differentHotels: 2, totalSpent: 250 });
  });

  it("returns zeros for an empty page", () => {
    expect(summarizeBookings([])).toEqual({
      totalBookings: 0,
      differentHotels: 0,
      totalSpent: 0,
    });
  });
});
