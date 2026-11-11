import { randomUUID } from "node:crypto";
import request from "supertest";
import { and, asc, eq } from "drizzle-orm";
import { bookingEvents, payments, type Database } from "@hotel-booking/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DATABASE } from "../src/database/postgres.database";
import { createTestApp, type TestApp } from "./support/create-app";
import {
  anonymous,
  insertBooking,
  insertHotel,
  registerAdmin,
  registerUser,
} from "./support/helpers";
import { routes } from "./support/routes";

const DAY_MS = 24 * 60 * 60 * 1000;
const UNKNOWN_BOOKING_ID = randomUUID();

type Agent = ReturnType<typeof request.agent>;

const inDays = (days: number) => new Date(Date.now() + days * DAY_MS);

/** A frozen policy snapshot as the API writes it at booking creation. */
const policySnapshot = (
  overrides: Partial<{
    freeCancelHoursBeforeArrival: number | null;
    penalty: Record<string, unknown>;
  }> = {},
) => {
  return {
    version: 1,
    source: "managed",
    freeCancelHoursBeforeArrival: 48,
    penalty: { type: "percent", percent: 25 },
    ...overrides,
  };
};

describe("booking cancellation", () => {
  let t: TestApp;
  let guest: Awaited<ReturnType<typeof registerUser>>;
  let other: Awaited<ReturnType<typeof registerUser>>;
  let owner: Awaited<ReturnType<typeof registerUser>>;
  let admin: Awaited<ReturnType<typeof registerAdmin>>;
  let hotelId: string;

  const cancel = (agent: Agent, id: string, key = randomUUID()) =>
    agent.post(routes.bookings.cancel(id)).set("Idempotency-Key", key);

  const cancelAsAdmin = (id: string, key = randomUUID()) =>
    admin.agent.post(routes.bookings.adminCancel(id)).set("Idempotency-Key", key);

  const eventsOf = async (bookingId: string) => {
    const db = t.app.get<Database>(DATABASE);
    return db
      .select()
      .from(bookingEvents)
      .where(eq(bookingEvents.bookingId, bookingId))
      .orderBy(asc(bookingEvents.createdAt));
  };

  const chargeOf = async (bookingId: string) => {
    const db = t.app.get<Database>(DATABASE);
    const [charge] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.bookingId, bookingId), eq(payments.provider, "stripe")));
    return charge;
  };

  beforeAll(async () => {
    t = await createTestApp();
    guest = await registerUser(t);
    other = await registerUser(t);
    owner = await registerUser(t);
    admin = await registerAdmin(t);
    hotelId = (await insertHotel(t, owner.user._id, { name: "Policy Inn" })).id;
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(() => {
    t.stripe.client.refunds.create.mockReset();
    t.stripe.client.refunds.create.mockImplementation(
      async (params: { payment_intent: string; amount?: number }) => ({
        id: `re_test_${randomUUID().slice(0, 8)}`,
        amount: params.amount ?? 0,
        payment_intent: params.payment_intent,
        status: "succeeded",
      }),
    );
  });

  it("refunds the policy result to the minor unit outside the free-cancel window", async () => {
    const booking = await insertBooking(t, guest.user._id, hotelId, {
      stripePaymentIntentId: "pi_policy_percent",
      totalCost: 199.99,
      checkIn: inDays(1),
      checkOut: inDays(3),
      cancellationPolicySnapshot: policySnapshot({
        penalty: { type: "percent", percent: 33 },
      }),
    });

    const res = await cancel(guest.agent, booking.id);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      booking: { status: "cancelled", paymentStatus: "refunded" },
      refundAmount: 133.99,
    });
    // 33% of 19 999 minor units is 6 599.67, rounded half-up to 6 600.
    expect(t.stripe.client.refunds.create).toHaveBeenCalledTimes(1);
    expect(t.stripe.client.refunds.create).toHaveBeenCalledWith(
      { payment_intent: "pi_policy_percent", amount: 13_399 },
      { idempotencyKey: expect.stringMatching(/^refund_/) },
    );
  });

  it("refunds everything inside the free-cancel window", async () => {
    const booking = await insertBooking(t, guest.user._id, hotelId, {
      stripePaymentIntentId: "pi_policy_free",
      totalCost: 240,
      checkIn: inDays(10),
      checkOut: inDays(12),
      cancellationPolicySnapshot: policySnapshot({
        penalty: { type: "full" },
      }),
    });

    const res = await cancel(guest.agent, booking.id);

    expect(res.status).toBe(200);
    expect(res.body.refundAmount).toBe(240);
    expect(t.stripe.client.refunds.create).toHaveBeenCalledWith(
      { payment_intent: "pi_policy_free", amount: 24_000 },
      { idempotencyKey: expect.stringMatching(/^refund_/) },
    );
  });

  it("withholds the first nights for a nights penalty", async () => {
    const booking = await insertBooking(t, guest.user._id, hotelId, {
      stripePaymentIntentId: "pi_policy_nights",
      totalCost: 300,
      checkIn: inDays(1),
      checkOut: inDays(4),
      nightlyRates: [
        { date: inDays(1).toISOString().slice(0, 10), amountMinor: 10_000 },
        { date: inDays(2).toISOString().slice(0, 10), amountMinor: 12_000 },
        { date: inDays(3).toISOString().slice(0, 10), amountMinor: 8_000 },
      ],
      cancellationPolicySnapshot: policySnapshot({ penalty: { type: "nights", nights: 2 } }),
    });

    const res = await cancel(guest.agent, booking.id);

    expect(res.status).toBe(200);
    expect(res.body.refundAmount).toBe(80);
    expect(t.stripe.client.refunds.create).toHaveBeenCalledWith(
      { payment_intent: "pi_policy_nights", amount: 8_000 },
      { idempotencyKey: expect.stringMatching(/^refund_/) },
    );
  });

  it("never refunds a non-refundable policy and skips Stripe", async () => {
    const booking = await insertBooking(t, guest.user._id, hotelId, {
      stripePaymentIntentId: "pi_policy_no_refund",
      totalCost: 150,
      checkIn: inDays(1),
      checkOut: inDays(2),
      cancellationPolicySnapshot: policySnapshot({ penalty: { type: "full" } }),
    });

    const res = await cancel(guest.agent, booking.id);

    expect(res.status).toBe(200);
    expect(res.body.refundAmount).toBe(0);
    expect(res.body.refundSkipped).toMatch(/no refundable amount/i);
    expect(res.body.booking).toMatchObject({ status: "cancelled", paymentStatus: "paid" });
    expect(t.stripe.client.refunds.create).not.toHaveBeenCalled();
  });

  it("falls back to the documented managed policy when the row has no snapshot", async () => {
    const booking = await insertBooking(t, guest.user._id, hotelId, {
      stripePaymentIntentId: "pi_policy_legacy",
      totalCost: 200,
      checkIn: inDays(1),
      checkOut: inDays(3),
    });

    const res = await cancel(guest.agent, booking.id);

    expect(res.status).toBe(200);
    // Default: one night of a two-night, 20 000-minor booking.
    expect(res.body.refundAmount).toBe(100);
    expect(t.stripe.client.refunds.create).toHaveBeenCalledWith(
      { payment_intent: "pi_policy_legacy", amount: 10_000 },
      { idempotencyKey: expect.stringMatching(/^refund_/) },
    );
  });

  it("replays the same Idempotency-Key without refunding twice", async () => {
    const booking = await insertBooking(t, guest.user._id, hotelId, {
      stripePaymentIntentId: "pi_policy_replay",
      totalCost: 120,
      checkIn: inDays(10),
      checkOut: inDays(12),
    });
    const key = randomUUID();

    const first = await cancel(guest.agent, booking.id, key).send({
      cancellationReason: "Plans changed",
    });
    const second = await cancel(guest.agent, booking.id, key).send({
      cancellationReason: "Plans changed",
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(t.stripe.client.refunds.create).toHaveBeenCalledTimes(1);

    const events = await eventsOf(booking.id);
    expect(events.map((event) => event.toStatus)).toEqual(["confirmed", "cancelling", "cancelled"]);
  });

  it("rejects a fresh cancellation of an already-cancelled booking", async () => {
    const booking = await insertBooking(t, guest.user._id, hotelId, {
      stripePaymentIntentId: "pi_policy_twice",
      checkIn: inDays(10),
      checkOut: inDays(12),
    });

    expect((await cancel(guest.agent, booking.id)).status).toBe(200);
    const again = await cancel(guest.agent, booking.id);

    expect(again.status).toBe(400);
    expect(again.body.message).toMatch(/cannot be cancelled/i);
    expect(t.stripe.client.refunds.create).toHaveBeenCalledTimes(1);
  });

  it("leaves the booking in needs_review when Stripe fails, then refunds on retry", async () => {
    const booking = await insertBooking(t, guest.user._id, hotelId, {
      stripePaymentIntentId: "pi_policy_failure",
      totalCost: 180,
      checkIn: inDays(10),
      checkOut: inDays(12),
    });
    t.stripe.client.refunds.create.mockRejectedValueOnce(new Error("card was declined"));

    const failed = await cancel(guest.agent, booking.id).send({
      cancellationReason: "Plans changed",
    });

    expect(failed.status).toBe(502);

    const stuck = await guest.agent.get(routes.bookings.byId(booking.id));
    expect(stuck.body).toMatchObject({
      status: "needs_review",
      cancellationReason: "Plans changed",
      paymentStatus: "paid",
    });

    const retried = await cancel(guest.agent, booking.id);

    expect(retried.status).toBe(200);
    expect(retried.body).toMatchObject({
      booking: { status: "cancelled", paymentStatus: "refunded" },
      refundAmount: 180,
    });
    expect(t.stripe.client.refunds.create).toHaveBeenCalledTimes(2);

    const events = (await eventsOf(booking.id)).map((event) => event.toStatus);
    expect(events).toEqual(["confirmed", "cancelling", "needs_review", "cancelling", "cancelled"]);
  });

  it("resumes a cancelled booking whose refund already succeeded", async () => {
    const booking = await insertBooking(t, guest.user._id, hotelId, {
      status: "cancelling",
      stripePaymentIntentId: "pi_policy_resume",
      totalCost: 100,
      cancellationReason: "Plans changed",
      checkIn: inDays(10),
      checkOut: inDays(12),
    });
    const charge = await chargeOf(booking.id);
    const db = t.app.get<Database>(DATABASE);
    await db.insert(payments).values({
      bookingId: booking.id,
      provider: "stripe",
      providerPaymentId: "re_policy_resume",
      amountMinor: 10_000,
      currencyCode: "GBP",
      status: "refunded",
      originalPaymentId: charge!.id,
    });

    const res = await cancel(guest.agent, booking.id);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      booking: { status: "cancelled", paymentStatus: "refunded" },
      refundAmount: 100,
    });
    expect(t.stripe.client.refunds.create).not.toHaveBeenCalled();
  });

  it("refuses to refund again while a cancellation refund is pending", async () => {
    const booking = await insertBooking(t, guest.user._id, hotelId, {
      status: "cancelling",
      stripePaymentIntentId: "pi_policy_pending",
      totalCost: 100,
      cancellationReason: "Plans changed",
      checkIn: inDays(10),
      checkOut: inDays(12),
    });
    const charge = await chargeOf(booking.id);
    const db = t.app.get<Database>(DATABASE);
    await db.insert(payments).values({
      bookingId: booking.id,
      provider: "stripe",
      providerPaymentId: undefined,
      amountMinor: 10_000,
      currencyCode: "GBP",
      status: "pending",
      originalPaymentId: charge!.id,
    });

    const res = await cancel(guest.agent, booking.id);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already in progress/i);
    expect(t.stripe.client.refunds.create).not.toHaveBeenCalled();
  });

  it("requires an Idempotency-Key on both cancellation routes", async () => {
    const booking = await insertBooking(t, guest.user._id, hotelId, {
      stripePaymentIntentId: "pi_policy_key",
      checkIn: inDays(10),
      checkOut: inDays(12),
    });

    const guestMiss = await guest.agent.post(routes.bookings.cancel(booking.id));
    const adminMiss = await admin.agent.post(routes.bookings.adminCancel(booking.id));

    expect(guestMiss.status).toBe(400);
    expect(guestMiss.body.message).toMatch(/idempotency-key/i);
    expect(adminMiss.status).toBe(400);
    expect(adminMiss.body.message).toMatch(/idempotency-key/i);
  });

  it("lets an admin cancel with a reason and records the actor and request", async () => {
    const booking = await insertBooking(t, guest.user._id, hotelId, {
      stripePaymentIntentId: "pi_policy_admin",
      totalCost: 160,
      checkIn: inDays(10),
      checkOut: inDays(12),
    });

    const res = await cancelAsAdmin(booking.id).send({
      cancellationReason: "Overbooked by the hotel",
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      booking: { status: "cancelled", cancellationReason: "Overbooked by the hotel" },
      refundAmount: 160,
    });

    const events = await eventsOf(booking.id);
    const cancelling = events.find((event) => event.toStatus === "cancelling");
    expect(cancelling).toMatchObject({
      actorUserId: admin.user._id,
      reason: "Overbooked by the hotel",
    });
    expect(cancelling?.requestId).toBeTruthy();
  });

  it("forbids unrelated users and answers 404 for an unknown booking", async () => {
    const booking = await insertBooking(t, guest.user._id, hotelId, {
      stripePaymentIntentId: "pi_policy_auth",
      checkIn: inDays(10),
      checkOut: inDays(12),
    });

    expect((await cancel(other.agent, booking.id)).status).toBe(403);
    expect((await cancel(guest.agent, UNKNOWN_BOOKING_ID)).status).toBe(404);
    expect((await anonymous(t).post(routes.bookings.cancel(booking.id))).status).toBe(401);
  });
});
