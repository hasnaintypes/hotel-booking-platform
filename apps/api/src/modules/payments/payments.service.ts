import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import {
  PaymentsRepository,
  type BookingRecord,
  type PaymentRecord,
} from "../../database/repositories/payments.repository";
import { StripeService } from "../../integrations/stripe/stripe.service";

const DEFAULT_CLAIM_TIMEOUT_MS = 30_000;

export type PaymentIntentResult = {
  payment: PaymentRecord;
  clientSecret: string | null;
};

export type RefundResult = {
  payment: PaymentRecord;
  amountMinor: number;
};

const stripeFailure = (error: unknown) => {
  if (error && typeof error === "object") {
    const candidate = error as { code?: unknown; message?: unknown };
    return {
      code: typeof candidate.code === "string" ? candidate.code : "stripe_error",
      message: typeof candidate.message === "string" ? candidate.message : "Stripe request failed",
    };
  }
  return { code: "stripe_error", message: "Stripe request failed" };
};

/**
 * Claim-call-settle payment operations. Every provider call is made outside a database
 * transaction after an atomic lease, and retries reuse a deterministic Stripe idempotency key.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly payments: PaymentsRepository,
    private readonly stripe: StripeService,
    private readonly config: ConfigService,
  ) {}

  private get claimTimeoutMs(): number {
    return this.config.get<number>("payment.claimTimeoutMs") ?? DEFAULT_CLAIM_TIMEOUT_MS;
  }

  private snapshotMoney(booking: BookingRecord): { amountMinor: number; currency: string } {
    const snapshot = booking.priceSnapshot as Record<string, unknown>;
    const snapshotTotal = snapshot.totalMinor;
    const snapshotCurrency = snapshot.currency;
    return {
      amountMinor:
        typeof snapshotTotal === "number" && Number.isSafeInteger(snapshotTotal)
          ? snapshotTotal
          : booking.totalAmountMinor,
      currency:
        typeof snapshotCurrency === "string" && snapshotCurrency.length === 3
          ? snapshotCurrency.toUpperCase()
          : booking.currencyCode,
    };
  }

  /**
   * Creates (or reuses) the PaymentIntent for a booking from its frozen snapshot. The client
   * never supplies the amount or currency; both come from the booking row.
   */
  async createIntentForBooking(bookingId: string): Promise<PaymentIntentResult> {
    const booking = await this.payments.findBooking(bookingId);
    if (!booking) throw new NotFoundException("Booking not found");

    const { amountMinor, currency } = this.snapshotMoney(booking);
    if (amountMinor <= 0) {
      throw new BadRequestException("Booking total must be positive before payment");
    }

    let payment = await this.payments.findCharge(bookingId);
    if (payment?.providerPaymentId) {
      return { payment, clientSecret: null };
    }

    const idempotencyKey = `pi_${booking.id}`;
    if (!payment) {
      payment = await this.payments.insertAttempt({
        bookingId: booking.id,
        provider: "stripe",
        idempotencyKey,
        amountMinor,
        currencyCode: currency,
        captureMethod: booking.inventorySource === "managed" ? "automatic" : "manual",
      });
    }

    const token = randomUUID();
    const claimed = await this.payments.claim(payment.id, "create", token, this.claimTimeoutMs);
    if (!claimed) {
      const existing = await this.payments.findByIdempotencyKey(idempotencyKey);
      if (existing) return { payment: existing, clientSecret: null };
      throw new ConflictException("Payment intent is already being created");
    }

    try {
      const intent = await this.stripe.client.paymentIntents.create(
        {
          amount: claimed.amountMinor,
          currency: claimed.currencyCode.toLowerCase(),
          capture_method: claimed.captureMethod,
          automatic_payment_methods: { enabled: true },
          metadata: {
            bookingId: booking.id,
            publicReference: booking.publicReference,
          },
        },
        { idempotencyKey },
      );

      const status =
        intent.status === "succeeded"
          ? "paid"
          : intent.status === "requires_capture"
            ? "authorized"
            : "pending";
      const capturedAmountMinor =
        status === "paid"
          ? typeof intent.amount_received === "number"
            ? intent.amount_received
            : claimed.amountMinor
          : undefined;

      const settled = await this.payments.settleIntent(claimed.id, token, {
        providerPaymentId: intent.id,
        status,
        ...(capturedAmountMinor !== undefined ? { capturedAmountMinor } : {}),
      });
      if (!settled) throw new ConflictException("Payment claim was lost while creating intent");

      if (settled.status === "paid") {
        await this.recordCharge(settled);
      }

      return {
        payment: settled,
        clientSecret: typeof intent.client_secret === "string" ? intent.client_secret : null,
      };
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      const failure = stripeFailure(error);
      this.logger.error(
        `Stripe PaymentIntent failed for booking ${booking.id}: ${failure.message}`,
      );
      await this.payments.releaseClaim(claimed.id, token, {
        status: "failed",
        code: failure.code,
        message: failure.message,
      });
      throw new BadGatewayException(failure.message);
    }
  }

  /**
   * Captures an authorized payment. A second worker that loses the claim gets a conflict, so the
   * provider sees exactly one capture for a payment.
   */
  async capturePayment(paymentId: string, amountMinor?: number): Promise<PaymentRecord> {
    const payment = await this.payments.findById(paymentId);
    if (!payment) throw new NotFoundException("Payment not found");
    if (payment.originalPaymentId) {
      throw new BadRequestException("Refund rows cannot be captured");
    }
    if (!payment.providerPaymentId) {
      throw new BadRequestException("Payment has no provider reference");
    }

    const captured = payment.capturedAmountMinor ?? payment.amountMinor;
    if (payment.status === "paid" && (amountMinor === undefined || captured >= amountMinor)) {
      return payment;
    }
    if (payment.status !== "authorized") {
      throw new BadRequestException("Only authorized payments can be captured");
    }

    const requested = amountMinor ?? payment.amountMinor;
    if (!Number.isSafeInteger(requested) || requested <= 0 || requested > payment.amountMinor) {
      throw new BadRequestException("Capture amount must be within the authorized amount");
    }

    const token = randomUUID();
    const claimed = await this.payments.claim(payment.id, "capture", token, this.claimTimeoutMs);
    if (!claimed) throw new ConflictException("Payment is already being captured");

    try {
      const intent = await this.stripe.client.paymentIntents.capture(
        claimed.providerPaymentId as string,
        requested === claimed.amountMinor ? undefined : { amount_to_capture: requested },
        { idempotencyKey: `cap_${claimed.id}` },
      );
      const capturedAmount =
        typeof intent.amount_received === "number" ? intent.amount_received : requested;
      const settled = await this.payments.settleCapture(claimed.id, token, capturedAmount);
      if (!settled) throw new ConflictException("Payment claim was lost while capturing");
      await this.recordCharge(settled);
      return settled;
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      const failure = stripeFailure(error);
      this.logger.error(`Stripe capture failed for payment ${payment.id}: ${failure.message}`);
      await this.payments.releaseClaim(claimed.id, token, {
        code: failure.code,
        message: failure.message,
      });
      throw new BadGatewayException(failure.message);
    }
  }

  /** Refunds the original charge for a booking, never more than remains captured. */
  async refundBooking(bookingId: string, amountMinor?: number): Promise<RefundResult> {
    const charge = await this.payments.findCharge(bookingId);
    if (!charge) throw new NotFoundException("Booking payment not found");
    return this.refundPayment(charge.id, amountMinor);
  }

  /**
   * Claims the original charge, records a pending refund attempt, calls Stripe with a stable
   * idempotency key, then settles the child row and ledger entry.
   */
  async refundPayment(paymentId: string, amountMinor?: number): Promise<RefundResult> {
    const charge = await this.payments.findById(paymentId);
    if (!charge) throw new NotFoundException("Payment not found");
    if (charge.originalPaymentId) {
      throw new BadRequestException("Refund rows cannot be refunded");
    }
    if (charge.provider !== "stripe" || !charge.providerPaymentId) {
      throw new BadRequestException("Payment has no Stripe reference to refund");
    }
    if (charge.status !== "paid") {
      throw new BadRequestException("Only captured payments can be refunded");
    }

    const booking = await this.payments.findBooking(charge.bookingId);
    if (!booking) throw new NotFoundException("Booking not found");

    const [totals, rows] = await Promise.all([
      this.payments.ledgerTotals(charge.bookingId),
      this.payments.listForBooking(charge.bookingId),
    ]);
    const recordedRefunds = rows
      .filter((row) => row.originalPaymentId === charge.id && row.status === "refunded")
      .reduce((total, row) => total + row.amountMinor, 0);
    const refundedMinor = Math.max(totals.refundedMinor, recordedRefunds);
    const capturedMinor = charge.capturedAmountMinor ?? charge.amountMinor;
    const availableMinor = Math.max(capturedMinor - refundedMinor, 0);

    const requested = amountMinor ?? availableMinor;
    if (!Number.isSafeInteger(requested) || requested <= 0) {
      throw new BadRequestException("There is no refundable amount left");
    }
    if (requested > availableMinor) {
      throw new BadRequestException("Refund amount exceeds the refundable balance");
    }

    const refundId = randomUUID();
    const claimed = await this.payments.claim(charge.id, "refund", refundId, this.claimTimeoutMs);
    if (!claimed) throw new ConflictException("Payment is already being refunded");

    let refundRow: PaymentRecord | undefined;
    try {
      refundRow = await this.payments.insertAttempt({
        id: refundId,
        bookingId: charge.bookingId,
        provider: charge.provider,
        idempotencyKey: `refund_${refundId}`,
        amountMinor: requested,
        currencyCode: charge.currencyCode,
        captureMethod: charge.captureMethod === "manual" ? "manual" : "automatic",
        originalPaymentId: charge.id,
        status: "pending",
      });

      const refund = await this.stripe.client.refunds.create(
        {
          payment_intent: charge.providerPaymentId,
          amount: requested,
        },
        { idempotencyKey: `refund_${refundId}` },
      );

      const settled = await this.payments.settleRefund(refundRow.id, refund.id);
      if (!settled) throw new ConflictException("Refund attempt disappeared while settling");
      await this.payments.releaseClaim(charge.id, refundId);
      await this.payments.recordLedgerEntry({
        bookingId: charge.bookingId,
        paymentId: settled.id,
        entryType: "refund",
        sourceKey: `payment:${settled.id}:refund`,
        amountMinor: requested,
        currencyCode: charge.currencyCode,
        description: `Refund for payment ${charge.id}`,
      });

      return { payment: settled, amountMinor: requested };
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      const failure = stripeFailure(error);
      this.logger.error(`Stripe refund failed for payment ${charge.id}: ${failure.message}`);
      if (refundRow) {
        await this.payments.markFailed(refundRow.id, {
          code: failure.code,
          message: failure.message,
          status: "failed",
        });
      }
      await this.payments.releaseClaim(charge.id, refundId, {
        code: failure.code,
        message: failure.message,
      });
      throw new BadGatewayException(failure.message);
    }
  }

  async balance(bookingId: string) {
    return this.payments.ledgerTotals(bookingId);
  }

  /** Reserved hook for Stripe processing fees; no provider balance lookup is wired in M2. */
  async recordFee(paymentId: string, feeMinor: number): Promise<void> {
    const payment = await this.payments.findById(paymentId);
    if (!payment) throw new NotFoundException("Payment not found");
    if (!Number.isSafeInteger(feeMinor) || feeMinor < 0) {
      throw new BadRequestException("Fee must be a non-negative integer in minor units");
    }
    await this.payments.recordLedgerEntry({
      bookingId: payment.bookingId,
      paymentId: payment.id,
      entryType: "fee",
      sourceKey: `payment:${payment.id}:fee`,
      amountMinor: feeMinor,
      currencyCode: payment.currencyCode,
      description: "Stripe processing fee",
    });
  }

  private async recordCharge(payment: PaymentRecord): Promise<void> {
    await this.payments.recordLedgerEntry({
      bookingId: payment.bookingId,
      paymentId: payment.id,
      entryType: "charge",
      sourceKey: `payment:${payment.id}:charge`,
      amountMinor: payment.capturedAmountMinor ?? payment.amountMinor,
      currencyCode: payment.currencyCode,
      description: `Charge for payment ${payment.id}`,
    });
  }
}
