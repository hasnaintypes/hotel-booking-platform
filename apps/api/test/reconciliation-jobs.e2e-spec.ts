import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { bookings, payments, type Database } from "@hotel-booking/db";
import { createTestApp, type TestApp } from "./support/create-app";
import { insertBooking, insertHotel, registerUser } from "./support/helpers";
import { DATABASE } from "../src/database/postgres.database";
import { PaymentsRepository } from "../src/database/repositories/payments.repository";
import { ReconciliationRepository } from "../src/database/repositories/reconciliation.repository";
import { BookingRecoveryService } from "../src/modules/reconciliation/booking-recovery.service";
import { ReconciliationService } from "../src/modules/reconciliation/reconciliation.service";

const MINUTE = 60_000;

describe("reconciliation, expiry and recovery jobs (#54)", () => {
  let t: TestApp;
  let db: Database;
  let guest: Awaited<ReturnType<typeof registerUser>>;
  let hotelId: string;
  let paymentsRepo: PaymentsRepository;
  let discrepancies: ReconciliationRepository;
  let recovery: BookingRecoveryService;
  let reconciliation: ReconciliationService;
  const clock = {
    current: new Date(),
    now(): Date {
      return new Date(clock.current);
    },
  };

  /** A timestamp offset from the frozen clock, used for backdated fixtures. */
  const at = (minutes: number) => new Date(clock.current.getTime() + minutes * MINUTE);
  const advance = (minutes: number) => {
    clock.current = new Date(clock.current.getTime() + minutes * MINUTE);
  };

  const newBooking = (overrides: Record<string, unknown> = {}) =>
    insertBooking(t, guest.user._id, hotelId, {
      createdAt: at(-60).toISOString(),
      updatedAt: at(-60).toISOString(),
      ...overrides,
    });

  const bookingRow = async (id: string) => {
    const [row] = await db.select().from(bookings).where(eq(bookings.id, id));
    return row;
  };

  const paymentRows = async (bookingId: string) =>
    db.select().from(payments).where(eq(payments.bookingId, bookingId));

  const openKinds = async () => (await discrepancies.listOpen()).map((row) => row.kind);

  beforeAll(async () => {
    clock.current = new Date();
    t = await createTestApp({ clock });
    db = t.app.get<Database>(DATABASE);
    paymentsRepo = t.app.get(PaymentsRepository);
    discrepancies = t.app.get(ReconciliationRepository);
    recovery = t.app.get(BookingRecoveryService);
    reconciliation = t.app.get(ReconciliationService);
    guest = await registerUser(t);
    const owner = await registerUser(t);
    hotelId = (await insertHotel(t, owner.user._id, { name: "Reconciliation Inn" })).id;
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    clock.current = new Date();
    // Only this file's fixtures are removed: users and hotels stay so every test can reuse them.
    await db.transaction(async (tx) => {
      await tx.execute(sql`set local session_replication_role = replica`);
      await tx.execute(sql`truncate table "bookings" cascade`);
    });

    t.stripe.client.paymentIntents.cancel.mockClear();
    t.stripe.client.paymentIntents.capture.mockReset();
    t.stripe.client.paymentIntents.capture.mockImplementation(
      async (id: string, params?: { amount_to_capture?: number }) => ({
        id,
        amount_received: params?.amount_to_capture ?? 20_000,
        status: "succeeded",
      }),
    );
    t.stripe.client.paymentIntents.retrieve.mockReset();
    t.stripe.client.paymentIntents.retrieve.mockResolvedValue({
      id: "pi_default",
      amount: 20_000,
      amount_received: 0,
      metadata: {},
      latest_charge: null,
      status: "requires_payment_method",
    });
    t.stripe.client.paymentIntents.list.mockReset();
    t.stripe.client.paymentIntents.list.mockResolvedValue({ data: [], has_more: false });
    t.stripe.client.refunds.retrieve.mockReset();
    t.stripe.client.refunds.retrieve.mockResolvedValue({
      id: "re_default",
      amount: 0,
      payment_intent: "pi_default",
      status: "succeeded",
    });
  });

  describe("expiry", () => {
    it("leaves an unexpired hold alone and expires it after the clock advances", async () => {
      const { id } = await newBooking({
        status: "pending_payment",
        paymentStatus: "pending",
        stripePaymentIntentId: "pi_expiring",
        expiresAt: at(30).toISOString(),
      });

      const early = await recovery.expirePendingBookings("expiry-1");
      expect(early.candidates).toBe(0);
      expect((await bookingRow(id)).status).toBe("pending_payment");

      advance(31);
      const late = await recovery.expirePendingBookings("expiry-2");

      expect(late).toMatchObject({ candidates: 1, expired: 1, paid: 0, failed: 0 });
      expect((await bookingRow(id)).status).toBe("expired");
      const [charge] = await paymentRows(id);
      expect(charge.status).toBe("failed");
      expect(charge.failureCode).toBe("payment_expired");
      expect(t.stripe.client.paymentIntents.cancel).toHaveBeenCalledWith(
        "pi_expiring",
        {},
        { idempotencyKey: `cancel_${charge.id}` },
      );
    });

    it("parks a paid booking for review instead of expiring it", async () => {
      const { id } = await newBooking({
        status: "pending_payment",
        paymentStatus: "pending",
        stripePaymentIntentId: "pi_paid_late",
        expiresAt: at(-30).toISOString(),
      });
      t.stripe.client.paymentIntents.retrieve.mockResolvedValue({
        id: "pi_paid_late",
        amount: 20_000,
        amount_received: 20_000,
        metadata: { bookingId: id },
        latest_charge: null,
        status: "succeeded",
      });

      const result = await recovery.expirePendingBookings("expiry-paid");

      expect(result).toMatchObject({ candidates: 1, expired: 0, paid: 1 });
      expect((await bookingRow(id)).status).toBe("needs_review");
      expect(t.stripe.client.paymentIntents.cancel).not.toHaveBeenCalled();
    });

    it("expires legacy rows that have no expires_at using created_at", async () => {
      const { id } = await newBooking({
        status: "pending_payment",
        paymentStatus: "pending",
        expiresAt: undefined,
        createdAt: at(-120).toISOString(),
        updatedAt: at(-120).toISOString(),
      });

      const result = await recovery.expirePendingBookings("expiry-legacy");

      expect(result.expired).toBe(1);
      expect((await bookingRow(id)).status).toBe("expired");
    });
  });

  describe("stuck-state sweeper", () => {
    it("repairs a crash between authorization and confirmation", async () => {
      const { id } = await newBooking({
        status: "authorized",
        paymentStatus: "authorized",
        stripePaymentIntentId: "pi_crash",
      });

      const result = await recovery.sweepStuckStates("sweep-crash");

      expect(result).toMatchObject({ authorized: 1, recovered: 1, unresolved: 0 });
      expect((await bookingRow(id)).status).toBe("confirmed");
      const [charge] = await paymentRows(id);
      expect(charge.status).toBe("paid");
      expect(charge.capturedAmountMinor).toBe(20_000);
      const totals = await paymentsRepo.ledgerTotals(id);
      expect(totals.chargedMinor).toBe(20_000);
      expect(t.stripe.client.paymentIntents.capture).toHaveBeenCalledWith("pi_crash", undefined, {
        idempotencyKey: `cap_${charge.id}`,
      });
    });

    it("recovers a lost authorization webhook by reading the provider first", async () => {
      const { id } = await newBooking({
        status: "authorized",
        paymentStatus: "pending",
        stripePaymentIntentId: "pi_lost_webhook",
      });
      t.stripe.client.paymentIntents.retrieve.mockResolvedValue({
        id: "pi_lost_webhook",
        amount: 20_000,
        amount_received: 0,
        metadata: { bookingId: id },
        latest_charge: null,
        status: "requires_capture",
      });

      const result = await recovery.sweepStuckStates("sweep-lost-webhook");

      expect(result.recovered).toBe(1);
      expect((await bookingRow(id)).status).toBe("confirmed");
      const [charge] = await paymentRows(id);
      expect(charge.status).toBe("paid");
    });

    it("parks an authorized booking when capture keeps failing", async () => {
      const { id } = await newBooking({
        status: "authorized",
        paymentStatus: "authorized",
        stripePaymentIntentId: "pi_capture_down",
      });
      t.stripe.client.paymentIntents.capture.mockRejectedValue(new Error("gateway down"));

      const result = await recovery.sweepStuckStates("sweep-capture-down");

      expect(result.unresolved).toBe(1);
      expect((await bookingRow(id)).status).toBe("needs_review");
    });

    it("completes a cancelling booking whose refund already settled", async () => {
      const { id } = await newBooking({
        status: "cancelling",
        paymentStatus: "paid",
        updatedAt: at(-120).toISOString(),
      });
      const [charge] = await paymentRows(id);
      await db.insert(payments).values({
        bookingId: id,
        provider: charge.provider,
        providerPaymentId: "re_settled",
        amountMinor: 20_000,
        currencyCode: "GBP",
        status: "refunded",
        originalPaymentId: charge.id,
      });

      const result = await recovery.sweepStuckStates("sweep-refunded");

      expect(result.recovered).toBe(1);
      expect((await bookingRow(id)).status).toBe("cancelled");
    });

    it("parks a cancelling booking whose refund outcome is unknown", async () => {
      const { id } = await newBooking({
        status: "cancelling",
        paymentStatus: "paid",
        updatedAt: at(-120).toISOString(),
      });
      const [charge] = await paymentRows(id);
      await db.insert(payments).values({
        bookingId: id,
        provider: charge.provider,
        amountMinor: 20_000,
        currencyCode: "GBP",
        status: "pending",
        originalPaymentId: charge.id,
      });

      const result = await recovery.sweepStuckStates("sweep-refund-pending");

      expect(result.unresolved).toBe(1);
      expect((await bookingRow(id)).status).toBe("needs_review");
    });
  });

  describe("Stripe reconciliation", () => {
    it("reports a local/provider status mismatch and deduplicates repeats", async () => {
      const { id } = await newBooking({
        status: "confirmed",
        paymentStatus: "paid",
        stripePaymentIntentId: "pi_mismatch",
      });
      t.stripe.client.paymentIntents.retrieve.mockResolvedValue({
        id: "pi_mismatch",
        amount: 20_000,
        amount_received: 0,
        metadata: { bookingId: id },
        latest_charge: null,
        status: "requires_payment_method",
      });

      const first = await reconciliation.reconcileStripe("reconcile-1");
      expect(first.found).toBeGreaterThanOrEqual(1);

      const open = await discrepancies.listOpen();
      const finding = open.find((row) => row.kind === "payment_status_mismatch");
      expect(finding).toBeDefined();
      expect(finding?.bookingId).toBe(id);
      expect(finding?.details).toMatchObject({
        localStatus: "paid",
        providerStatus: "requires_payment_method",
        expectedStatus: "pending",
      });

      const second = await reconciliation.reconcileStripe("reconcile-2");
      expect(second.found).toBe(0);
      expect(
        (await discrepancies.listOpen()).filter((row) => row.kind === finding?.kind),
      ).toHaveLength(1);
    });

    it("reports a provider intent that has no local payment row", async () => {
      const { id } = await newBooking({
        status: "pending_payment",
        paymentStatus: "pending",
      });
      t.stripe.client.paymentIntents.list.mockResolvedValue({
        data: [
          {
            id: "pi_ghost",
            amount: 12_345,
            amount_received: 12_345,
            currency: "gbp",
            metadata: { bookingId: id },
            status: "succeeded",
          },
        ],
        has_more: false,
      });

      const result = await reconciliation.reconcileStripe("reconcile-ghost");

      expect(result.providerIntentsChecked).toBe(1);
      const finding = (await discrepancies.listOpen()).find(
        (row) => row.kind === "provider_without_local",
      );
      expect(finding).toBeDefined();
      expect(finding?.bookingId).toBe(id);
      expect(finding?.providerReference).toBe("pi_ghost");
    });

    it("reports a refund total that differs from the ledger", async () => {
      const { id } = await newBooking({
        status: "confirmed",
        paymentStatus: "paid",
        stripePaymentIntentId: "pi_refunded",
      });
      t.stripe.client.paymentIntents.retrieve.mockResolvedValue({
        id: "pi_refunded",
        amount: 20_000,
        amount_received: 20_000,
        metadata: { bookingId: id },
        latest_charge: { id: "ch_refunded", amount_refunded: 5_000, refunded: false },
        status: "succeeded",
      });

      await reconciliation.reconcileStripe("reconcile-refunds");

      const finding = (await discrepancies.listOpen()).find(
        (row) => row.kind === "refund_mismatch",
      );
      expect(finding?.details).toMatchObject({
        localRefundedMinor: 0,
        providerRefundedMinor: 5_000,
      });
    });

    it("reports a provider object that no longer exists", async () => {
      await newBooking({
        status: "confirmed",
        paymentStatus: "paid",
        stripePaymentIntentId: "pi_deleted",
      });
      t.stripe.client.paymentIntents.retrieve.mockRejectedValue(
        Object.assign(new Error("No such payment_intent"), { code: "resource_missing" }),
      );

      await reconciliation.reconcileStripe("reconcile-missing");

      expect(await openKinds()).toContain("provider_missing");
    });

    it("reports a local attempt that never reached the provider", async () => {
      const { id } = await newBooking({
        status: "pending_payment",
        paymentStatus: "pending",
      });
      await db.insert(payments).values({
        bookingId: id,
        provider: "stripe",
        amountMinor: 20_000,
        currencyCode: "GBP",
        status: "pending",
        createdAt: at(-120),
      });

      await reconciliation.reconcileStripe("reconcile-local-only");

      expect(await openKinds()).toContain("local_without_provider");
    });
  });

  describe("nightly ledger check", () => {
    it("flags a paid booking whose charge never reached the ledger", async () => {
      const { id } = await newBooking({
        status: "confirmed",
        paymentStatus: "paid",
      });

      const result = await reconciliation.checkLedger("ledger-1");

      expect(result.violations).toBe(1);
      const finding = (await discrepancies.listOpen()).find(
        (row) => row.kind === "ledger_mismatch",
      );
      expect(finding?.bookingId).toBe(id);
      expect(finding?.details).toMatchObject({
        ledgerChargedMinor: 0,
        expectedChargedMinor: 20_000,
      });
    });

    it("passes once the ledger matches the payments", async () => {
      const { id } = await newBooking({
        status: "confirmed",
        paymentStatus: "paid",
      });
      const [charge] = await paymentRows(id);
      await paymentsRepo.recordLedgerEntry({
        bookingId: id,
        paymentId: charge.id,
        entryType: "charge",
        sourceKey: `payment:${charge.id}:charge`,
        amountMinor: 20_000,
        currencyCode: "GBP",
      });

      const result = await reconciliation.checkLedger("ledger-2");

      expect(result).toMatchObject({ bookingsChecked: 1, violations: 0 });
    });

    it("flags a refund payment with no matching ledger refund", async () => {
      const { id } = await newBooking({
        status: "cancelled",
        paymentStatus: "paid",
        createdAt: at(-30).toISOString(),
      });
      const [charge] = await paymentRows(id);
      await paymentsRepo.recordLedgerEntry({
        bookingId: id,
        paymentId: charge.id,
        entryType: "charge",
        sourceKey: `payment:${charge.id}:charge`,
        amountMinor: 20_000,
        currencyCode: "GBP",
      });
      await db.insert(payments).values({
        bookingId: id,
        provider: charge.provider,
        providerPaymentId: "re_missing_ledger",
        amountMinor: 5_000,
        currencyCode: "GBP",
        status: "refunded",
        originalPaymentId: charge.id,
      });

      const result = await reconciliation.checkLedger("ledger-3");

      expect(result.violations).toBe(1);
      const finding = (await discrepancies.listOpen()).find(
        (row) => row.kind === "ledger_mismatch",
      );
      expect(finding?.details).toMatchObject({
        ledgerRefundedMinor: 0,
        expectedRefundedMinor: 5_000,
      });
    });
  });
});
