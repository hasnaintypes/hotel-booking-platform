import { Types } from "mongoose";
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

const UNKNOWN_ID = "64b7f0f0f0f0f0f0f0f0f0f0";

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
        // Known behaviour: hotelId/userId are plain strings, so `.populate()` is a no-op.
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
        // Known behaviour: `.populate()` does nothing on a string-typed id.
        hotelId,
      });
    });

    it("shows a booking to the hotel owner and to admins", async () => {
      expect((await owner.agent.get(routes.bookings.byId(bookingId))).status).toBe(200);
      expect((await admin.agent.get(routes.bookings.byId(bookingId))).status).toBe(200);
    });

    it("forbids unrelated users and unknown bookings", async () => {
      expect((await other.agent.get(routes.bookings.byId(bookingId))).status).toBe(403);
      expect((await guest.agent.get(routes.bookings.byId(UNKNOWN_ID))).status).toBe(404);
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
        // Known behaviour: `.populate("userId")` is a no-op on a string-typed id.
        userId: guest.user._id,
      });

      expect((await admin.agent.get(routes.bookings.forHotel(hotelId))).status).toBe(200);
    });

    it("forbids unrelated users and answers 404 for an unknown hotel", async () => {
      expect((await other.agent.get(routes.bookings.forHotel(hotelId))).status).toBe(403);
      expect((await owner.agent.get(routes.bookings.forHotel(UNKNOWN_ID))).status).toBe(404);
      expect((await anonymous(t).get(routes.bookings.forHotel(hotelId))).status).toBe(401);
    });
  });

  describe("PATCH /api/bookings/:id/status", () => {
    it("lets the hotel owner move a booking to completed", async () => {
      const res = await owner.agent
        .patch(routes.bookings.status(bookingId))
        .send({ status: "completed" });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("completed");

      const stored = await guest.agent.get(routes.bookings.byId(bookingId));
      expect(stored.body.status).toBe("completed");

      await owner.agent.patch(routes.bookings.status(bookingId)).send({ status: "confirmed" });
    });

    it("refuses cancel/refund through the status endpoint", async () => {
      for (const status of ["cancelled", "refunded"]) {
        const res = await owner.agent.patch(routes.bookings.status(bookingId)).send({ status });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/cancel/i);
      }
    });

    it("rejects an unknown status and an unauthorised caller", async () => {
      const invalid = await owner.agent
        .patch(routes.bookings.status(bookingId))
        .send({ status: "archived" });
      expect(invalid.status).toBe(400);

      expect(
        (await other.agent.patch(routes.bookings.status(bookingId)).send({ status: "completed" }))
          .status,
      ).toBe(403);
      expect(
        (await anonymous(t).patch(routes.bookings.status(bookingId)).send({ status: "completed" }))
          .status,
      ).toBe(401);
    });
  });

  describe("PATCH /api/bookings/:id/payment", () => {
    it("lets the hotel owner record a payment update", async () => {
      const res = await owner.agent
        .patch(routes.bookings.payment(bookingId))
        .send({ paymentStatus: "refunded", paymentMethod: "card" });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ paymentStatus: "refunded", paymentMethod: "card" });

      await owner.agent
        .patch(routes.bookings.payment(bookingId))
        .send({ paymentStatus: "paid", paymentMethod: "card" });
    });

    it("rejects an unknown payment status and an unauthorised caller", async () => {
      expect(
        (
          await owner.agent
            .patch(routes.bookings.payment(bookingId))
            .send({ paymentStatus: "settled" })
        ).status,
      ).toBe(400);
      expect(
        (
          await other.agent
            .patch(routes.bookings.payment(bookingId))
            .send({ paymentStatus: "paid" })
        ).status,
      ).toBe(403);
      expect(
        (
          await anonymous(t)
            .patch(routes.bookings.payment(bookingId))
            .send({ paymentStatus: "paid" })
        ).status,
      ).toBe(401);
    });
  });

  describe("POST /api/bookings/:id/cancel", () => {
    it("cancels an upcoming paid booking, refunds it and reverses the counters", async () => {
      const fresh = await insertBooking(t, guest.user._id, hotelId, {
        stripePaymentIntentId: "pi_test_cancel_ok",
        totalCost: 150,
      });
      const beforeHotel = await t.connection
        .collection("hotels")
        .findOne({ _id: new Types.ObjectId(hotelId) });
      const beforeUser = await t.connection.collection("users").findOne({
        _id: new Types.ObjectId(guest.user._id),
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

      const afterHotel = await t.connection
        .collection("hotels")
        .findOne({ _id: new Types.ObjectId(hotelId) });
      const afterUser = await t.connection.collection("users").findOne({
        _id: new Types.ObjectId(guest.user._id),
      });
      expect(afterHotel?.totalBookings).toBe((beforeHotel?.totalBookings ?? 0) - 1);
      expect(afterHotel?.totalRevenue).toBe((beforeHotel?.totalRevenue ?? 0) - 150);
      expect(afterUser?.totalBookings).toBe((beforeUser?.totalBookings ?? 0) - 1);
      expect(afterUser?.totalSpent).toBe((beforeUser?.totalSpent ?? 0) - 150);
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
      expect((await guest.agent.post(routes.bookings.cancel(UNKNOWN_ID))).status).toBe(404);
      expect((await anonymous(t).post(routes.bookings.cancel(bookingId))).status).toBe(401);
    });
  });

  describe("DELETE /api/bookings/:id", () => {
    it("lets an admin delete a booking and reverses the counters once", async () => {
      const fresh = await insertBooking(t, guest.user._id, hotelId, { totalCost: 120 });
      const hotel = await t.connection
        .collection("hotels")
        .findOne({ _id: new Types.ObjectId(hotelId) });

      const res = await admin.agent.delete(routes.bookings.byId(fresh.id));
      expect(res.status).toBe(204);
      expect(res.text).toBe("");

      const afterHotel = await t.connection
        .collection("hotels")
        .findOne({ _id: new Types.ObjectId(hotelId) });
      expect(afterHotel?.totalBookings).toBe((hotel?.totalBookings ?? 0) - 1);
      expect(afterHotel?.totalRevenue).toBe((hotel?.totalRevenue ?? 0) - 120);

      expect((await admin.agent.delete(routes.bookings.byId(fresh.id))).status).toBe(404);
    });

    it("does not touch the counters twice for an already-cancelled booking", async () => {
      const fresh = await insertBooking(t, guest.user._id, hotelId, { status: "cancelled" });
      const hotel = await t.connection
        .collection("hotels")
        .findOne({ _id: new Types.ObjectId(hotelId) });

      expect((await admin.agent.delete(routes.bookings.byId(fresh.id))).status).toBe(204);
      const afterHotel = await t.connection
        .collection("hotels")
        .findOne({ _id: new Types.ObjectId(hotelId) });
      expect(afterHotel?.totalBookings).toBe(hotel?.totalBookings);
    });

    it("is closed to non-admins and anonymous callers", async () => {
      expect((await guest.agent.delete(routes.bookings.byId(bookingId))).status).toBe(403);
      expect((await anonymous(t).delete(routes.bookings.byId(bookingId))).status).toBe(401);
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
