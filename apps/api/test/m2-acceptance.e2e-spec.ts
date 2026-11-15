import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { bookings, ledgerEntries, payments, type Database } from "@hotel-booking/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DATABASE } from "../src/database/postgres.database";
import { PaymentsRepository } from "../src/database/repositories/payments.repository";
import { PaymentsService } from "../src/modules/payments/payments.service";
import { BookingRecoveryService } from "../src/modules/reconciliation/booking-recovery.service";
import { createTestApp, type TestApp } from "./support/create-app";
import { killProcess, restartProcess } from "./support/crash";
import { createFakeClock } from "./support/fake-clock";
import {
  failNextStripeCall,
  hangNextStripeCall,
  seedFakeIntent,
  stripeError,
} from "./support/fake-stripe";
import { insertBooking, insertHotel, registerUser } from "./support/helpers";
import { routes } from "./support/routes";
import { deliverStripeWebhook, stripeEvent, stripePaymentIntent } from "./support/webhooks";

/**
 * The M2 acceptance gate (#57): the milestone's exit criteria, exercised against real PostgreSQL
 * with the Stripe stand-in and a controllable clock.
 *
 * This file deliberately contains only what the rest of the suite does not already prove. The
 * remaining criteria are covered by named tests elsewhere, and are listed here so the gate is
 * auditable from one place:
 *
 * - Same Idempotency-Key returns the same booking: `idempotency.e2e-spec.ts` ("replays a real
 *   booking without creating a second row or charging Stripe twice") and
 *   `booking-creation.e2e-spec.ts` ("replays a known key without a second booking or PaymentIntent").
 * - The same key with a different payload is a 422: `idempotency.e2e-spec.ts` and
 *   `booking-creation.e2e-spec.ts` ("rejects the same key with a different payload").
 * - A duplicate webhook is applied once and a failing handler is retried:
 *   `stripe-webhooks.e2e-spec.ts` ("acknowledges a duplicate delivery ...", "returns 5xx on a
 *   processing failure and applies the event on retry").
 * - Out-of-order webhooks converge: `stripe-webhooks.e2e-spec.ts` ("converges to the same final
 *   state when events arrive out of order").
 * - A crash between authorization and confirmation is repaired: `reconciliation-jobs.e2e-spec.ts`
 *   ("repairs a crash between authorization and confirmation"); this file adds the version where the
 *   process really disappears with a provider call in flight.
 * - Expiry never hides a late payment: `reconciliation-jobs.e2e-spec.ts` ("parks a paid booking for
 *   review instead of expiring it").
 * - Cancellation ledger arithmetic: `booking-cancellation.e2e-spec.ts`.
 * - Parallel last-room booking: not applicable. M2 has no own-inventory availability to oversell;
 *   managed room inventory is M8.
 */
describe("M2 acceptance gate on real PostgreSQL (#57)", () => {
  const clock = createFakeClock();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const inDays = (days: number) => new Date(clock.now().getTime() + days * DAY_MS);

  let t: TestApp;
  let closed = false;
  let guest: Awaited<ReturnType<typeof registerUser>>;
  let owner: Awaited<ReturnType<typeof registerUser>>;
  let hotelId: string;

  const db = () => t.app.get<Database>(DATABASE);
  const paymentRepository = () => t.app.get(PaymentsRepository);
  const paymentService = () => t.app.get(PaymentsService);
  const recovery = () => t.app.get(BookingRecoveryService);

  const closeCurrent = async () => {
    if (closed) return;
    closed = true;
    await t.close();
  };

  const bookingRow = async (id: string) => {
    const [row] = await db().select().from(bookings).where(eq(bookings.id, id));
    return row;
  };

  const ledgerFor = async (bookingId: string) =>
    db().select().from(ledgerEntries).where(eq(ledgerEntries.bookingId, bookingId));

  /**
   * Writes the charge ledger row a real capture would have written. Fixtures inserted straight
   * into PostgreSQL have the payment row but not its ledger entry.
   */
  const seedChargeLedger = async (bookingId: string) => {
    const charge = await paymentRepository().findCharge(bookingId);
    if (!charge) throw new Error(`No charge row for booking ${bookingId}`);
    await db()
      .insert(ledgerEntries)
      .values({
        bookingId,
        paymentId: charge.id,
        entryType: "charge",
        sourceKey: `payment:${charge.id}:charge`,
        amountMinor: charge.capturedAmountMinor ?? charge.amountMinor,
        currencyCode: charge.currencyCode,
      });
  };

  beforeAll(async () => {
    t = await createTestApp({ clock });
    guest = await registerUser(t);
    owner = await registerUser(t);
    hotelId = (await insertHotel(t, owner.user._id, { name: "Acceptance Inn" })).id;
  });

  afterAll(closeCurrent);

  beforeEach(() => {
    // Provider-side effect logs are per test; the account itself stays shared.
    t.stripe.provider.captures.length = 0;
    t.stripe.provider.refunds.length = 0;
    t.stripe.provider.cancellations.length = 0;
  });

  it("charges once when Stripe answers 5xx to a capture, then succeeds on retry", async () => {
    seedFakeIntent(t.stripe.provider, { id: "pi_acceptance_capture_5xx", amountMinor: 10_000 });
    const { id } = await insertBooking(t, guest.user._id, hotelId, {
      status: "authorized",
      paymentStatus: "authorized",
      stripePaymentIntentId: "pi_acceptance_capture_5xx",
      totalCost: 100,
    });
    const charge = await paymentRepository().findCharge(id);

    failNextStripeCall(t.stripe, "paymentIntents.capture", stripeError("api"));
    await expect(paymentService().capturePayment(charge!.id)).rejects.toMatchObject({
      status: 502,
    });

    // The provider refused, so nothing moved and the authorization is still capturable.
    expect(t.stripe.provider.captures).toHaveLength(0);
    expect(await paymentRepository().findById(charge!.id)).toMatchObject({
      status: "authorized",
      claimToken: null,
      failureCode: "api_error",
    });
    expect((await paymentRepository().ledgerTotals(id)).chargedMinor).toBe(0);

    await paymentService().capturePayment(charge!.id);

    expect(t.stripe.provider.captures).toEqual([
      {
        intentId: "pi_acceptance_capture_5xx",
        amountMinor: 10_000,
        idempotencyKey: `cap_${charge!.id}`,
      },
    ]);
    expect(await paymentRepository().ledgerTotals(id)).toMatchObject({
      chargedMinor: 10_000,
      refundedMinor: 0,
      netMinor: 10_000,
    });
  });

  it("parks a cancellation whose refund answers 5xx, then refunds once on retry", async () => {
    const { id } = await insertBooking(t, guest.user._id, hotelId, {
      status: "confirmed",
      paymentStatus: "paid",
      stripePaymentIntentId: "pi_acceptance_refund_5xx",
      totalCost: 180,
      checkIn: inDays(10).toISOString(),
      checkOut: inDays(12).toISOString(),
    });

    const cancel = (key = randomUUID()) =>
      guest.agent
        .post(routes.bookings.cancel(id))
        .set("Idempotency-Key", key)
        .send({ cancellationReason: "Plans changed" });

    failNextStripeCall(t.stripe, "refunds.create", stripeError("api"));
    const failed = await cancel();

    expect(failed.status).toBe(502);
    expect(t.stripe.provider.refunds).toHaveLength(0);
    expect(await bookingRow(id)).toMatchObject({ status: "needs_review" });
    expect((await paymentRepository().findCharge(id))?.status).toBe("paid");
    const attempts = await db().select().from(payments).where(eq(payments.bookingId, id));
    expect(attempts.filter((row) => row.originalPaymentId !== null)).toMatchObject([
      { status: "failed", failureCode: "api_error" },
    ]);
    expect((await paymentRepository().ledgerTotals(id)).refundedMinor).toBe(0);

    const retried = await cancel();

    expect(retried.status).toBe(200);
    expect(retried.body).toMatchObject({
      booking: { status: "cancelled", paymentStatus: "refunded" },
      refundAmount: 180,
    });
    expect(t.stripe.provider.refunds).toHaveLength(1);
    expect(t.stripe.provider.refunds[0]).toMatchObject({
      intentId: "pi_acceptance_refund_5xx",
      amountMinor: 18_000,
    });
    expect((await paymentRepository().ledgerTotals(id)).refundedMinor).toBe(18_000);
  });

  it("refunds once when two cancellations of the same booking race", async () => {
    const { id } = await insertBooking(t, guest.user._id, hotelId, {
      status: "confirmed",
      paymentStatus: "paid",
      stripePaymentIntentId: "pi_acceptance_double_cancel",
      totalCost: 200,
      checkIn: inDays(10).toISOString(),
      checkOut: inDays(12).toISOString(),
    });
    await seedChargeLedger(id);

    // Different keys, so the idempotency interceptor does not collapse them: this is a genuine race
    // for the same booking, not a replay.
    const cancel = () =>
      guest.agent
        .post(routes.bookings.cancel(id))
        .set("Idempotency-Key", randomUUID())
        .send({ cancellationReason: "Plans changed" });

    const [first, second] = await Promise.all([cancel(), cancel()]);
    const statuses = [first.status, second.status];

    // Either request may win, and the loser may reuse the winner's result, so both 200 and
    // 200-with-one-409 are correct. What must never happen is a 5xx or a second refund.
    expect(statuses.filter((status) => status === 200).length).toBeGreaterThan(0);
    expect(statuses.every((status) => status === 200 || (status >= 400 && status < 500))).toBe(
      true,
    );
    expect(t.stripe.provider.refunds).toHaveLength(1);
    expect(await bookingRow(id)).toMatchObject({ status: "cancelled" });
    const refundRows = (
      await db().select().from(payments).where(eq(payments.bookingId, id))
    ).filter((row) => row.originalPaymentId !== null);
    expect(refundRows).toHaveLength(1);
    expect(refundRows[0]).toMatchObject({ status: "refunded", amountMinor: 20_000 });
    expect(await paymentRepository().ledgerTotals(id)).toMatchObject({
      chargedMinor: 20_000,
      refundedMinor: 20_000,
      netMinor: 0,
    });
  });

  it("keeps a PaymentIntent bound to its own booking when a webhook names another", async () => {
    const first = await insertBooking(t, guest.user._id, hotelId, {
      status: "pending_payment",
      paymentStatus: "pending",
      stripePaymentIntentId: "pi_acceptance_bound",
      totalCost: 250,
    });
    const second = await insertBooking(t, guest.user._id, hotelId, {
      status: "pending_payment",
      paymentStatus: "pending",
      totalCost: 250,
    });

    // A hostile or buggy event: correct intent, wrong booking in the metadata.
    const delivered = await deliverStripeWebhook(
      t,
      stripeEvent(
        "payment_intent.succeeded",
        stripePaymentIntent("pi_acceptance_bound", {
          amount: 25_000,
          amount_received: 25_000,
          status: "succeeded",
          metadata: { bookingId: second.id },
        }),
      ),
    );

    expect(delivered.status).toBe(200);
    expect(await bookingRow(first.id)).toMatchObject({ status: "confirmed" });
    expect((await paymentRepository().findCharge(first.id))?.status).toBe("paid");
    expect(await bookingRow(second.id)).toMatchObject({ status: "pending_payment" });
    expect(await paymentRepository().findCharge(second.id)).toBeUndefined();

    const targetLedger = await ledgerFor(second.id);
    expect(targetLedger).toHaveLength(0);
    const charge = await paymentRepository().findCharge(first.id);
    expect(await ledgerFor(first.id)).toMatchObject([
      { entryType: "charge", amountMinor: 25_000, paymentId: charge!.id },
    ]);
  });

  it("creates one booking and one PaymentIntent when the same offer is booked twice at once", async () => {
    const stay = {
      checkIn: inDays(10).toISOString(),
      checkOut: inDays(12).toISOString(),
    };
    const quote = await guest.agent.post(routes.offers.create).send({
      hotelId,
      adultCount: 1,
      childCount: 0,
      ...stay,
    });
    expect(quote.status).toBe(201);

    const book = () =>
      guest.agent
        .post(routes.bookings.create)
        .set("Idempotency-Key", randomUUID())
        .send({
          offerId: quote.body.id,
          hotelId,
          firstName: "Gus",
          lastName: "Guest",
          email: "guest@example.test",
          adultCount: 1,
          childCount: 0,
          ...stay,
        });

    const [first, second] = await Promise.all([book(), book()]);

    expect(
      [first.status, second.status],
      JSON.stringify({ first: first.body, second: second.body }),
    ).toEqual([201, 201]);
    expect(first.body._id).toBe(second.body._id);

    const rows = await db().select().from(bookings).where(eq(bookings.offerId, quote.body.id));
    expect(rows).toHaveLength(1);
    const attempts = await db()
      .select()
      .from(payments)
      .where(eq(payments.bookingId, first.body._id));
    expect(attempts).toHaveLength(1);
    expect(t.stripe.client.paymentIntents.create).toHaveBeenCalledTimes(1);
  });

  // This must stay last: it replaces the application instance, and the HTTP agents created for the
  // first one still point at the server that was killed.
  it("completes a capture whose worker was killed mid-step, without charging twice", async () => {
    seedFakeIntent(t.stripe.provider, { id: "pi_acceptance_crash", amountMinor: 10_000 });
    const { id } = await insertBooking(t, guest.user._id, hotelId, {
      status: "authorized",
      paymentStatus: "authorized",
      stripePaymentIntentId: "pi_acceptance_crash",
      totalCost: 100,
      // Stale enough for the sweeper to pick it up, exactly as it would be after a restart.
      updatedAt: clock.at(-20).toISOString(),
    });
    const charge = await paymentRepository().findCharge(id);

    // The provider captures, then the process dies before it can read the answer.
    const { entered } = hangNextStripeCall(t.stripe, "paymentIntents.capture");
    void recovery().sweepStuckStates("crashed-worker");
    await entered;

    expect(t.stripe.provider.captures).toHaveLength(1);
    expect(await bookingRow(id)).toMatchObject({ status: "authorized" });
    expect((await paymentRepository().findCharge(id))?.status).toBe("authorized");

    const provider = t.stripe.provider;
    await killProcess(t);
    closed = true;
    t = await restartProcess({ provider, clock });
    closed = false;

    // The lease the dead process held is only reclaimable once it expires; move the clock on by
    // clearing it the way time would.
    await db().execute(
      sql`update "payments" set "claim_expires_at" = now() - interval '1 second' where "id" = ${charge!.id}`,
    );

    const sweep = await recovery().sweepStuckStates("after-restart");

    expect(sweep.recovered).toBe(1);
    expect(await bookingRow(id)).toMatchObject({ status: "confirmed" });
    expect((await paymentRepository().findCharge(id))?.status).toBe("paid");
    // The retry replayed `cap_<paymentId>`, so the provider user saw one capture and one charge.
    expect(provider.captures).toEqual([
      {
        intentId: "pi_acceptance_crash",
        amountMinor: 10_000,
        idempotencyKey: `cap_${charge!.id}`,
      },
    ]);
    expect(await paymentRepository().ledgerTotals(id)).toMatchObject({
      chargedMinor: 10_000,
      netMinor: 10_000,
    });
    expect((await ledgerFor(id)).filter((row) => row.entryType === "charge")).toHaveLength(1);
  });
});
