import { createHmac, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  bookingEvents,
  bookings,
  inboxEvents,
  ledgerEntries,
  payments,
  type Database,
} from "@hotel-booking/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DATABASE } from "../src/database/postgres.database";
import { createTestApp, type TestApp } from "./support/create-app";
import { anonymous, insertBooking, insertHotel, registerUser } from "./support/helpers";
import { routes } from "./support/routes";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET as string;

const nowSeconds = () => Math.floor(Date.now() / 1000);

function event(type: string, object: Record<string, unknown>, id = `evt_${randomUUID()}`) {
  return {
    id,
    object: "event",
    api_version: "2025-01-01",
    created: nowSeconds(),
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type,
    data: { object },
  };
}

function signatureFor(payload: string, timestamp = nowSeconds(), secret = WEBHOOK_SECRET) {
  const digest = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

const paymentIntent = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  object: "payment_intent",
  amount: 10_000,
  amount_received: 0,
  amount_capturable: 0,
  currency: "gbp",
  status: "requires_payment_method",
  metadata: {},
  ...overrides,
});

describe("stripe webhooks", () => {
  let t: TestApp;
  let guest: Awaited<ReturnType<typeof registerUser>>;
  let hotelId: string;

  beforeAll(async () => {
    process.env.LOG_LEVEL = "debug";
    t = await createTestApp();
    guest = await registerUser(t);
    hotelId = (await insertHotel(t, guest.user._id, { name: "Webhook Inn" })).id;
  });

  afterAll(async () => {
    await t.close();
    delete process.env.LOG_LEVEL;
  });

  beforeEach(() => {
    t.logs.clear();
  });

  const db = () => t.app.get<Database>(DATABASE);

  const pendingBooking = async (intentId?: string) => {
    const { id } = await insertBooking(t, guest.user._id, hotelId, {
      status: "pending_payment",
      paymentStatus: "pending",
      ...(intentId ? { stripePaymentIntentId: intentId } : {}),
      totalCost: 100,
    });
    return id;
  };

  const paidBooking = async (intentId: string) => {
    const { id } = await insertBooking(t, guest.user._id, hotelId, {
      status: "confirmed",
      paymentStatus: "paid",
      stripePaymentIntentId: intentId,
      totalCost: 100,
    });
    const [payment] = await db()
      .select()
      .from(payments)
      .where(eq(payments.providerPaymentId, intentId))
      .limit(1);
    await db()
      .insert(ledgerEntries)
      .values({
        bookingId: id,
        paymentId: payment.id,
        entryType: "charge",
        sourceKey: `payment:${payment.id}:charge`,
        amountMinor: 10_000,
        currencyCode: "GBP",
      });
    return { bookingId: id, paymentId: payment.id };
  };

  const bookingRow = async (id: string) => {
    const [row] = await db().select().from(bookings).where(eq(bookings.id, id)).limit(1);
    return row;
  };

  const paymentRow = async (intentId: string) => {
    const [row] = await db()
      .select()
      .from(payments)
      .where(eq(payments.providerPaymentId, intentId))
      .limit(1);
    return row;
  };

  const ledgerRows = async (bookingId: string) =>
    db().select().from(ledgerEntries).where(eq(ledgerEntries.bookingId, bookingId));

  const inboxRow = async (eventId: string) => {
    const [row] = await db()
      .select()
      .from(inboxEvents)
      .where(and(eq(inboxEvents.provider, "stripe"), eq(inboxEvents.eventId, eventId)))
      .limit(1);
    return row;
  };

  const bookingStatuses = async (bookingId: string) => {
    const rows = await db()
      .select({ to: bookingEvents.toStatus })
      .from(bookingEvents)
      .where(eq(bookingEvents.bookingId, bookingId));
    return rows.map((row) => row.to);
  };

  const deliver = (payloadEvent: ReturnType<typeof event>, header?: string) => {
    const payload = JSON.stringify(payloadEvent);
    return anonymous(t)
      .post(routes.webhooks.stripe)
      .set("Content-Type", "application/json")
      .set("stripe-signature", header ?? signatureFor(payload))
      .send(payload);
  };

  it("applies a signed payment_intent.succeeded once and confirms the booking", async () => {
    const bookingId = await pendingBooking("pi_wh_success");
    const payloadEvent = event(
      "payment_intent.succeeded",
      paymentIntent("pi_wh_success", {
        amount_received: 10_000,
        status: "succeeded",
        metadata: { bookingId },
      }),
    );

    const res = await deliver(payloadEvent);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, duplicate: false });

    expect(await paymentRow("pi_wh_success")).toMatchObject({
      status: "paid",
      capturedAmountMinor: 10_000,
    });
    expect((await bookingRow(bookingId)).status).toBe("confirmed");

    const ledger = await ledgerRows(bookingId);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ entryType: "charge", amountMinor: 10_000 });

    expect(await bookingStatuses(bookingId)).toEqual(
      expect.arrayContaining(["pending_payment", "confirming", "confirmed"]),
    );
    expect((await inboxRow(payloadEvent.id))?.processedAt).toBeInstanceOf(Date);
  });

  it("acknowledges a duplicate delivery without applying it again", async () => {
    const bookingId = await pendingBooking("pi_wh_duplicate");
    const payloadEvent = event(
      "payment_intent.succeeded",
      paymentIntent("pi_wh_duplicate", {
        amount_received: 10_000,
        status: "succeeded",
        metadata: { bookingId },
      }),
    );

    expect((await deliver(payloadEvent)).status).toBe(200);
    const duplicate = await deliver(payloadEvent);
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.duplicate).toBe(true);

    expect(await ledgerRows(bookingId)).toHaveLength(1);
    const statuses = await bookingStatuses(bookingId);
    expect(statuses.filter((status) => status === "confirmed")).toHaveLength(1);
    expect(statuses.filter((status) => status === "confirming")).toHaveLength(1);
  });

  it("converges to the same final state when events arrive out of order", async () => {
    const bookingId = await pendingBooking("pi_wh_out_of_order");

    const succeeded = event(
      "payment_intent.succeeded",
      paymentIntent("pi_wh_out_of_order", {
        amount_received: 10_000,
        status: "succeeded",
        metadata: { bookingId },
      }),
    );
    const authorized = event(
      "payment_intent.amount_capturable_updated",
      paymentIntent("pi_wh_out_of_order", {
        amount_capturable: 10_000,
        status: "requires_capture",
        metadata: { bookingId },
      }),
    );
    const failed = event(
      "payment_intent.payment_failed",
      paymentIntent("pi_wh_out_of_order", {
        status: "requires_payment_method",
        metadata: { bookingId },
        last_payment_error: { code: "card_declined", message: "declined" },
      }),
    );

    for (const payloadEvent of [succeeded, authorized, failed]) {
      expect((await deliver(payloadEvent)).status).toBe(200);
    }

    expect(await paymentRow("pi_wh_out_of_order")).toMatchObject({
      status: "paid",
      capturedAmountMinor: 10_000,
    });
    expect((await bookingRow(bookingId)).status).toBe("confirmed");
    expect(await ledgerRows(bookingId)).toHaveLength(1);
  });

  it("returns 5xx on a processing failure and applies the event on retry", async () => {
    const bookingId = await pendingBooking();
    const payloadEvent = event(
      "payment_intent.succeeded",
      paymentIntent("pi_wh_retry", {
        amount_received: 10_000,
        status: "succeeded",
        metadata: { bookingId },
      }),
    );

    const failed = await deliver(payloadEvent);
    expect(failed.status).toBe(500);
    expect(await inboxRow(payloadEvent.id)).toBeUndefined();
    expect(await paymentRow("pi_wh_retry")).toBeUndefined();
    expect((await bookingRow(bookingId)).status).toBe("pending_payment");

    await db()
      .insert(payments)
      .values({
        bookingId,
        provider: "stripe",
        providerPaymentId: "pi_wh_retry",
        idempotencyKey: `pi_${bookingId}`,
        amountMinor: 10_000,
        currencyCode: "GBP",
        status: "pending",
      });

    expect((await deliver(payloadEvent)).status).toBe(200);
    expect(await paymentRow("pi_wh_retry")).toMatchObject({ status: "paid" });
    expect((await bookingRow(bookingId)).status).toBe("confirmed");
    expect((await inboxRow(payloadEvent.id))?.processedAt).toBeInstanceOf(Date);
  });

  it("rejects an invalid signature with no side effects", async () => {
    const bookingId = await pendingBooking("pi_wh_bad_signature");
    const payloadEvent = event(
      "payment_intent.succeeded",
      paymentIntent("pi_wh_bad_signature", {
        amount_received: 10_000,
        status: "succeeded",
        metadata: { bookingId },
      }),
    );

    const res = await deliver(payloadEvent, "t=1,v1=deadbeef");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("BAD_REQUEST");

    expect(await paymentRow("pi_wh_bad_signature")).toMatchObject({ status: "pending" });
    expect((await bookingRow(bookingId)).status).toBe("pending_payment");
    expect(await inboxRow(payloadEvent.id)).toBeUndefined();
  });

  it("rejects a signature outside the replay window", async () => {
    const bookingId = await pendingBooking("pi_wh_stale");
    const payloadEvent = event(
      "payment_intent.succeeded",
      paymentIntent("pi_wh_stale", { metadata: { bookingId } }),
    );
    const payload = JSON.stringify(payloadEvent);

    const res = await deliver(payloadEvent, signatureFor(payload, nowSeconds() - 3_600));
    expect(res.status).toBe(400);
    expect(await inboxRow(payloadEvent.id)).toBeUndefined();
  });

  it("rejects a request without a signature", async () => {
    const payloadEvent = event("payment_intent.succeeded", paymentIntent("pi_wh_unsigned"));
    const res = await anonymous(t)
      .post(routes.webhooks.stripe)
      .set("Content-Type", "application/json")
      .send(JSON.stringify(payloadEvent));

    expect(res.status).toBe(400);
    expect(await inboxRow(payloadEvent.id)).toBeUndefined();
  });

  it("records an unhandled event type without changing payment state", async () => {
    const payloadEvent = event("customer.created", { id: "cus_wh_1", object: "customer" });

    expect((await deliver(payloadEvent)).status).toBe(200);
    expect((await inboxRow(payloadEvent.id))?.processedAt).toBeInstanceOf(Date);
  });

  it("marks the payment failed but keeps the booking open for a retry", async () => {
    const bookingId = await pendingBooking("pi_wh_failed");
    const payloadEvent = event(
      "payment_intent.payment_failed",
      paymentIntent("pi_wh_failed", {
        status: "requires_payment_method",
        metadata: { bookingId },
        last_payment_error: { code: "card_declined", message: "Your card was declined." },
      }),
    );

    expect((await deliver(payloadEvent)).status).toBe(200);
    expect(await paymentRow("pi_wh_failed")).toMatchObject({
      status: "failed",
      failureCode: "card_declined",
      failureMessage: "Your card was declined.",
    });
    expect((await bookingRow(bookingId)).status).toBe("pending_payment");
  });

  it("marks a manual authorization as authorized", async () => {
    const bookingId = await pendingBooking("pi_wh_authorized");
    const payloadEvent = event(
      "payment_intent.amount_capturable_updated",
      paymentIntent("pi_wh_authorized", {
        amount_capturable: 10_000,
        status: "requires_capture",
        metadata: { bookingId },
      }),
    );

    expect((await deliver(payloadEvent)).status).toBe(200);
    expect(await paymentRow("pi_wh_authorized")).toMatchObject({
      status: "authorized",
      capturedAmountMinor: null,
    });
    expect((await bookingRow(bookingId)).status).toBe("authorized");
  });

  it("cancels the booking when the PaymentIntent is canceled", async () => {
    const bookingId = await pendingBooking("pi_wh_canceled");
    const payloadEvent = event(
      "payment_intent.canceled",
      paymentIntent("pi_wh_canceled", { status: "canceled", metadata: { bookingId } }),
    );

    expect((await deliver(payloadEvent)).status).toBe(200);
    expect(await paymentRow("pi_wh_canceled")).toMatchObject({
      status: "failed",
      failureCode: "payment_intent.canceled",
    });
    expect((await bookingRow(bookingId)).status).toBe("cancelled");
  });

  it("records each refunded charge once, including partial and out-of-order refunds", async () => {
    const { bookingId } = await paidBooking("pi_wh_refunded");

    const refundEvent = (refunds: Array<{ id: string; amount: number }>, amountRefunded: number) =>
      event("charge.refunded", {
        id: "ch_wh_refunded",
        object: "charge",
        payment_intent: "pi_wh_refunded",
        amount_refunded: amountRefunded,
        refunded: amountRefunded === 10_000,
        refunds: {
          object: "list",
          data: refunds.map((refund) => ({
            ...refund,
            object: "refund",
            status: "succeeded",
            currency: "gbp",
          })),
        },
      });

    expect((await deliver(refundEvent([{ id: "re_wh_1", amount: 4_000 }], 4_000))).status).toBe(
      200,
    );
    const afterFirst = await ledgerRows(bookingId);
    expect(afterFirst.filter((row) => row.entryType === "refund")).toHaveLength(1);
    expect(afterFirst.find((row) => row.entryType === "refund")?.amountMinor).toBe(4_000);

    // A different event id replaying the same provider refund must not double count.
    expect((await deliver(refundEvent([{ id: "re_wh_1", amount: 4_000 }], 4_000))).status).toBe(
      200,
    );

    // The second refund arrives with a full snapshot that also contains the first one.
    expect(
      (
        await deliver(
          refundEvent(
            [
              { id: "re_wh_1", amount: 4_000 },
              { id: "re_wh_2", amount: 6_000 },
            ],
            10_000,
          ),
        )
      ).status,
    ).toBe(200);

    const refunds = (await ledgerRows(bookingId)).filter((row) => row.entryType === "refund");
    expect(refunds.map((row) => row.sourceKey).sort()).toEqual([
      "stripe_refund:re_wh_1",
      "stripe_refund:re_wh_2",
    ]);
    expect(refunds.reduce((total, row) => total + row.amountMinor, 0)).toBe(10_000);
  });

  it("moves the booking to needs_review when a dispute is opened", async () => {
    const { bookingId } = await paidBooking("pi_wh_dispute");
    const payloadEvent = event("charge.dispute.created", {
      id: "dp_wh_1",
      object: "dispute",
      charge: "ch_wh_dispute",
      payment_intent: "pi_wh_dispute",
      amount: 10_000,
      currency: "gbp",
      status: "needs_response",
    });

    expect((await deliver(payloadEvent)).status).toBe(200);
    expect((await bookingRow(bookingId)).status).toBe("needs_review");
    expect(t.logs.raw()).toContain("ALERT: Stripe dispute dp_wh_1");
  });

  it("raises an alert-level log after repeated failures for the same event", async () => {
    const payloadEvent = event(
      "payment_intent.succeeded",
      paymentIntent("pi_wh_always_fails", { status: "succeeded", amount_received: 10_000 }),
    );

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await deliver(payloadEvent)).status).toBe(500);
    }

    expect(t.logs.raw()).toContain(`ALERT: Stripe webhook ${payloadEvent.id}`);
    expect(await inboxRow(payloadEvent.id)).toBeUndefined();
  });
});
