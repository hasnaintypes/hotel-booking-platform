import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { bookings, type Database } from "@hotel-booking/db";
import { createTestApp, type TestApp } from "./support/create-app";
import { insertBooking, insertHotel, registerUser } from "./support/helpers";
import { PaymentsRepository } from "../src/database/repositories/payments.repository";
import { PaymentsService } from "../src/modules/payments/payments.service";
import { DATABASE } from "../src/database/postgres.database";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const settle = <T>(promise: Promise<T>) =>
  promise.then(
    (value) => ({ status: "fulfilled" as const, value }),
    (reason: unknown) => ({ status: "rejected" as const, reason }),
  );

describe("payments", () => {
  let t: TestApp;
  let guest: Awaited<ReturnType<typeof registerUser>>;
  let hotelId: string;
  let payments: PaymentsRepository;
  let service: PaymentsService;

  beforeAll(async () => {
    t = await createTestApp();
    guest = await registerUser(t);
    const owner = await registerUser(t);
    hotelId = (await insertHotel(t, owner.user._id, { name: "Payments Inn" })).id;
    payments = t.app.get(PaymentsRepository);
    service = t.app.get(PaymentsService);
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(() => {
    t.stripe.client.paymentIntents.create.mockClear();
    t.stripe.client.paymentIntents.capture.mockReset();
    t.stripe.client.refunds.create.mockReset();
  });

  it("creates one intent from the booking snapshot and reuses its idempotency key", async () => {
    const { id } = await insertBooking(t, guest.user._id, hotelId, {
      status: "pending_payment",
      paymentStatus: "pending",
    });

    await t.app
      .get<Database>(DATABASE)
      .update(bookings)
      .set({
        totalAmountMinor: 12_345,
        priceSnapshot: { totalMinor: 12_345, currency: "GBP" },
      })
      .where(eq(bookings.id, id));

    const first = await service.createIntentForBooking(id);
    const second = await service.createIntentForBooking(id);

    expect(first.payment.id).toBe(second.payment.id);
    expect(first.payment.amountMinor).toBe(12_345);
    expect(first.payment.currencyCode).toBe("GBP");
    expect(first.payment.captureMethod).toBe("automatic");
    expect(first.payment.status).toBe("pending");
    expect(t.stripe.client.paymentIntents.create).toHaveBeenCalledTimes(1);
    expect(t.stripe.client.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 12_345,
        currency: "gbp",
        capture_method: "automatic",
        metadata: expect.objectContaining({ bookingId: id }),
      }),
      { idempotencyKey: `pi_${id}` },
    );
  });

  it("captures once when two workers race for the same payment", async () => {
    const { id } = await insertBooking(t, guest.user._id, hotelId, {
      paymentStatus: "authorized",
      stripePaymentIntentId: "pi_capture_race",
      totalCost: 200,
    });
    const charge = await payments.findCharge(id);
    expect(charge).toBeDefined();

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    t.stripe.client.paymentIntents.capture.mockImplementation(
      async (paymentIntentId: string, params?: { amount_to_capture?: number }) => {
        await gate;
        return {
          id: paymentIntentId,
          amount_received: params?.amount_to_capture ?? 20_000,
          status: "succeeded",
        };
      },
    );

    const first = settle(service.capturePayment(charge!.id));
    await vi.waitFor(() => expect(t.stripe.client.paymentIntents.capture).toHaveBeenCalledTimes(1));
    const second = settle(service.capturePayment(charge!.id));
    await delay(50);
    release();

    const results = await Promise.all([first, second]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(t.stripe.client.paymentIntents.capture).toHaveBeenCalledTimes(1);
    expect(t.stripe.client.paymentIntents.capture).toHaveBeenCalledWith(
      "pi_capture_race",
      undefined,
      { idempotencyKey: `cap_${charge!.id}` },
    );

    const settled = await payments.findById(charge!.id);
    expect(settled?.status).toBe("paid");
    expect(settled?.capturedAmountMinor).toBe(20_000);
    const totals = await payments.ledgerTotals(id);
    expect(totals).toMatchObject({ chargedMinor: 20_000, refundedMinor: 0, netMinor: 20_000 });
  });

  it("reverts the capture claim when the gateway fails, then retries successfully", async () => {
    const { id } = await insertBooking(t, guest.user._id, hotelId, {
      paymentStatus: "authorized",
      stripePaymentIntentId: "pi_capture_retry",
      totalCost: 100,
    });
    const charge = await payments.findCharge(id);

    t.stripe.client.paymentIntents.capture.mockRejectedValueOnce(new Error("gateway down"));
    await expect(service.capturePayment(charge!.id)).rejects.toMatchObject({ status: 502 });

    const afterFailure = await payments.findById(charge!.id);
    expect(afterFailure).toMatchObject({
      status: "authorized",
      claimToken: null,
      failureCode: "stripe_error",
      failureMessage: "gateway down",
    });
    expect((await payments.ledgerTotals(id)).chargedMinor).toBe(0);

    t.stripe.client.paymentIntents.capture.mockResolvedValueOnce({
      id: "pi_capture_retry",
      amount_received: 10_000,
      status: "succeeded",
    });
    const retried = await service.capturePayment(charge!.id);
    expect(retried.status).toBe("paid");
    expect((await payments.ledgerTotals(id)).netMinor).toBe(10_000);
  });

  it("refunds partially, refuses an over-refund, then refunds the remainder", async () => {
    const { id } = await insertBooking(t, guest.user._id, hotelId, {
      paymentStatus: "paid",
      stripePaymentIntentId: "pi_refund_arithmetic",
      totalCost: 200,
    });
    const charge = await payments.findCharge(id);
    await payments.recordLedgerEntry({
      bookingId: id,
      paymentId: charge!.id,
      entryType: "charge",
      sourceKey: `payment:${charge!.id}:charge`,
      amountMinor: 20_000,
      currencyCode: "GBP",
    });

    const first = await service.refundPayment(charge!.id, 5_000);
    expect(first.amountMinor).toBe(5_000);
    expect(await payments.ledgerTotals(id)).toMatchObject({
      chargedMinor: 20_000,
      refundedMinor: 5_000,
      netMinor: 15_000,
    });

    await expect(service.refundPayment(charge!.id, 20_000)).rejects.toMatchObject({ status: 400 });

    const second = await service.refundPayment(charge!.id, 15_000);
    expect(second.amountMinor).toBe(15_000);
    expect(await payments.ledgerTotals(id)).toMatchObject({
      chargedMinor: 20_000,
      refundedMinor: 20_000,
      netMinor: 0,
    });

    const refundCalls = t.stripe.client.refunds.create.mock.calls;
    expect(refundCalls.map(([params]) => (params as { amount: number }).amount)).toEqual([
      5_000, 15_000,
    ]);
    expect(
      refundCalls.every(([, options]) =>
        /^refund_/.test((options as { idempotencyKey: string }).idempotencyKey),
      ),
    ).toBe(true);
  });

  it("refunds once when two workers race for the same refund", async () => {
    const { id } = await insertBooking(t, guest.user._id, hotelId, {
      paymentStatus: "paid",
      stripePaymentIntentId: "pi_refund_race",
      totalCost: 200,
    });
    const charge = await payments.findCharge(id);
    await payments.recordLedgerEntry({
      bookingId: id,
      paymentId: charge!.id,
      entryType: "charge",
      sourceKey: `payment:${charge!.id}:charge`,
      amountMinor: 20_000,
      currencyCode: "GBP",
    });

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    t.stripe.client.refunds.create.mockImplementation(
      async (params: { payment_intent: string; amount?: number }) => {
        await gate;
        return {
          id: "re_refund_race",
          amount: params.amount ?? 0,
          payment_intent: params.payment_intent,
          status: "succeeded",
        };
      },
    );

    const first = settle(service.refundPayment(charge!.id, 5_000));
    await vi.waitFor(() => expect(t.stripe.client.refunds.create).toHaveBeenCalledTimes(1));
    const second = settle(service.refundPayment(charge!.id, 5_000));
    await delay(50);
    release();

    const results = await Promise.all([first, second]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(t.stripe.client.refunds.create).toHaveBeenCalledTimes(1);
    expect(await payments.ledgerTotals(id)).toMatchObject({
      chargedMinor: 20_000,
      refundedMinor: 5_000,
      netMinor: 15_000,
    });
  });
});
