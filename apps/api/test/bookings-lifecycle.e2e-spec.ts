import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./support/create-app";
import {
  anonymous,
  insertBooking,
  insertHotel,
  registerAdmin,
  registerUser,
} from "./support/helpers";
import { routes } from "./support/routes";

const UNKNOWN_BOOKING_ID = randomUUID();
const UNKNOWN_HOTEL_ID = randomUUID();

describe("bookings", () => {
  let t: TestApp;
  let guest: Awaited<ReturnType<typeof registerUser>>;
  let other: Awaited<ReturnType<typeof registerUser>>;
  let owner: Awaited<ReturnType<typeof registerUser>>;
  let admin: Awaited<ReturnType<typeof registerAdmin>>;
  let hotelId: string;
  let bookingId: string;

  beforeAll(async () => {
    t = await createTestApp();
    guest = await registerUser(t);
    other = await registerUser(t);
    owner = await registerUser(t);
    admin = await registerAdmin(t);
    hotelId = (await insertHotel(t, owner.user._id, { name: "Lifecycle Inn" })).id;
    bookingId = (
      await insertBooking(t, guest.user._id, hotelId, {
        stripePaymentIntentId: "pi_test_lifecycle",
        specialRequests: "Late check-in",
      })
    ).id;
  });
  afterAll(async () => {
    await t.close();
  });

  beforeEach(() => {
    t.stripe.client.refunds.create.mockReset();
    t.stripe.client.refunds.create.mockResolvedValue({
      id: "re_lifecycle",
      amount: 15_000,
      payment_intent: "pi_test_lifecycle",
      status: "succeeded",
    });
  });

  describe("GET /api/bookings (admin list)", () => {
    it("returns every booking with the hotel summary", async () => {
      const res = await admin.agent.get(routes.bookings.list);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        _id: bookingId,
        status: "confirmed",
        paymentStatus: "paid",
        // Response ids are PostgreSQL UUID strings.
        hotelId,
      });
    });

    it("is closed to guests and anonymous callers", async () => {
      expect((await guest.agent.get(routes.bookings.list)).status).toBe(403);
      expect((await anonymous(t).get(routes.bookings.list)).status).toBe(401);
    });
  });

  describe("GET /api/bookings/:id", () => {
    it("shows a booking to the guest who made it", async () => {
      const res = await guest.agent.get(routes.bookings.byId(bookingId));
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        _id: bookingId,
        specialRequests: "Late check-in",
        // Response ids are PostgreSQL UUID strings.
        hotelId,
      });
    });

    it("shows a booking to the hotel owner and to admins", async () => {
      expect((await owner.agent.get(routes.bookings.byId(bookingId))).status).toBe(200);
      expect((await admin.agent.get(routes.bookings.byId(bookingId))).status).toBe(200);
    });

    it("forbids unrelated users and unknown bookings", async () => {
      expect((await other.agent.get(routes.bookings.byId(bookingId))).status).toBe(403);
      expect((await guest.agent.get(routes.bookings.byId(UNKNOWN_BOOKING_ID))).status).toBe(404);
    });

    it("requires a session", async () => {
      expect((await anonymous(t).get(routes.bookings.byId(bookingId))).status).toBe(401);
    });
  });

  describe("GET /api/bookings/hotel/:hotelId", () => {
    it("lists the hotel's bookings for its owner and for admins", async () => {
      const asOwner = await owner.agent.get(routes.bookings.forHotel(hotelId));
      expect(asOwner.status).toBe(200);
      expect(asOwner.body).toHaveLength(1);
      expect(asOwner.body[0]).toMatchObject({
        _id: bookingId,
        // Response ids are PostgreSQL UUID strings.
        userId: guest.user._id,
      });

      expect((await admin.agent.get(routes.bookings.forHotel(hotelId))).status).toBe(200);
    });

    it("forbids unrelated users and answers 404 for an unknown hotel", async () => {
      expect((await other.agent.get(routes.bookings.forHotel(hotelId))).status).toBe(403);
      expect((await owner.agent.get(routes.bookings.forHotel(UNKNOWN_HOTEL_ID))).status).toBe(404);
      expect((await anonymous(t).get(routes.bookings.forHotel(hotelId))).status).toBe(401);
    });
  });

  describe("POST /api/bookings/:id/cancel", () => {
    it("cancels an upcoming paid booking and refunds it", async () => {
      const fresh = await insertBooking(t, guest.user._id, hotelId, {
        stripePaymentIntentId: "pi_test_cancel_ok",
        totalCost: 150,
      });
      const res = await guest.agent
        .post(routes.bookings.cancel(fresh.id))
        .send({ cancellationReason: "  Plans changed  " });

      expect(res.status).toBe(200);
      expect(res.body.booking).toMatchObject({
        status: "cancelled",
        paymentStatus: "refunded",
        cancellationReason: "Plans changed",
        refundAmount: 150,
      });
      expect(res.body.refundAmount).toBe(150);
      expect(t.stripe.client.refunds.create).toHaveBeenCalledWith({
        payment_intent: "pi_test_cancel_ok",
      });
    });

    it("skips the refund when a paid booking has no payment intent", async () => {
      const fresh = await insertBooking(t, guest.user._id, hotelId, {
        stripePaymentIntentId: undefined,
      });
      const res = await guest.agent.post(routes.bookings.cancel(fresh.id));

      expect(res.status).toBe(200);
      expect(res.body.refundSkipped).toMatch(/no payment intent/i);
      expect(t.stripe.client.refunds.create).not.toHaveBeenCalled();
    });

    it("refuses a booking that can no longer be cancelled", async () => {
      const fresh = await insertBooking(t, guest.user._id, hotelId, { status: "cancelled" });
      const res = await guest.agent.post(routes.bookings.cancel(fresh.id));
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/cannot be cancelled/i);
    });

    it("forbids other users and answers 404 for an unknown booking", async () => {
      expect((await other.agent.post(routes.bookings.cancel(bookingId))).status).toBe(403);
      expect((await guest.agent.post(routes.bookings.cancel(UNKNOWN_BOOKING_ID))).status).toBe(404);
      expect((await anonymous(t).post(routes.bookings.cancel(bookingId))).status).toBe(401);
    });
  });

  describe("GET /api/my-bookings", () => {
    it("groups only the caller's bookings under their hotels", async () => {
      const res = await guest.agent.get(routes.bookings.myBookings);
      expect(res.status).toBe(200);
      const entries = res.body.filter((hotel: { _id: string }) => hotel._id === hotelId);
      expect(entries.length).toBeGreaterThan(0);
      expect(entries[0].name).toBe("Lifecycle Inn");
      const bookingIds = entries.flatMap((entry: { bookings: { _id: string }[] }) =>
        entry.bookings.map((booking) => booking._id),
      );
      expect(bookingIds).toContain(bookingId);

      const otherView = await other.agent.get(routes.bookings.myBookings);
      expect(otherView.status).toBe(200);
      expect(otherView.body).toEqual([]);
    });

    it("requires a session", async () => {
      expect((await anonymous(t).get(routes.bookings.myBookings)).status).toBe(401);
    });
  });
});
