import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PinoLogger } from "nestjs-pino";
import type Stripe from "stripe";
import {
  StripeWebhookRepository,
  type WebhookOutcome,
  type WebhookTransaction,
} from "../../database/repositories/stripe-webhook.repository";
import type { PaymentRecord } from "../../database/repositories/payments.repository";
import { isUuid } from "../../common/utils/uuid";
import { StripeService } from "../../integrations/stripe/stripe.service";
import type { BookingStatus } from "../../domain/bookings/booking-state-machine";

const PROVIDER = "stripe";
const DEFAULT_TOLERANCE_SECONDS = 300;
const DEFAULT_ALERT_THRESHOLD = 5;
const MAX_TRACKED_FAILURES = 1_000;

type BookingTarget = "authorized" | "confirmed" | "cancelled" | "needs_review";

/**
 * Applies Stripe webhook events to payment, booking and ledger state. Provider calls are never made
 * here: the event is the source of truth, and every write commits with the inbox row so a retry is
 * either applied completely or not at all.
 */
@Injectable()
export class StripeWebhookService {
  /**
   * Consecutive failures per event, used to raise an alert-level line for a stuck event. The map is
   * per process; wiring this into a real alerting/metrics backend is an observability milestone
   * task, and the structured `ALERT:` line is the integration point until then.
   */
  private readonly failures = new Map<string, number>();

  constructor(
    private readonly webhooks: StripeWebhookRepository,
    private readonly stripe: StripeService,
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(StripeWebhookService.name);
  }

  private get toleranceSeconds(): number {
    return this.config.get<number>("stripe.webhookToleranceSeconds") ?? DEFAULT_TOLERANCE_SECONDS;
  }

  private get alertThreshold(): number {
    return (
      this.config.get<number>("stripe.webhookFailureAlertThreshold") ?? DEFAULT_ALERT_THRESHOLD
    );
  }

  /**
   * Verifies the signature over the exact bytes Stripe sent, then applies the event once. An
   * invalid signature or a stale timestamp is a client error with no side effects; a processing
   * failure is a 5xx so Stripe retries with backoff.
   */
  async handle(
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ): Promise<WebhookOutcome> {
    const secret = this.config.get<string>("stripe.webhookSecret");
    if (!secret) {
      throw new ServiceUnavailableException("Stripe webhooks are not configured");
    }
    if (!rawBody?.length) {
      throw new BadRequestException("Missing request body");
    }
    if (!signature) {
      throw new BadRequestException("Missing Stripe signature");
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.client.webhooks.constructEvent(
        rawBody,
        signature,
        secret,
        this.toleranceSeconds,
      );
    } catch {
      this.logger.warn("Rejected a Stripe webhook with an invalid signature or stale timestamp");
      throw new BadRequestException("Invalid Stripe signature");
    }

    try {
      const outcome = await this.webhooks.processOnce(
        {
          provider: PROVIDER,
          eventId: event.id,
          eventType: event.type,
          payload: event as unknown as Record<string, unknown>,
        },
        (tx) => this.apply(tx, event),
      );

      if (outcome === "processed") {
        this.failures.delete(event.id);
      } else {
        this.logger.debug(`Acknowledged duplicate Stripe event ${event.id} (${event.type})`);
      }

      return outcome;
    } catch (error) {
      this.recordFailure(event, error);
      throw new InternalServerErrorException("Stripe webhook processing failed");
    }
  }

  private recordFailure(event: Stripe.Event, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const attempts = (this.failures.get(event.id) ?? 0) + 1;

    if (this.failures.size >= MAX_TRACKED_FAILURES && !this.failures.has(event.id)) {
      const oldest = this.failures.keys().next().value;
      if (oldest !== undefined) this.failures.delete(oldest);
    }
    this.failures.set(event.id, attempts);

    const context = { eventId: event.id, eventType: event.type, attempts, err: error };

    if (attempts >= this.alertThreshold) {
      this.logger.error(
        context,
        `ALERT: Stripe webhook ${event.id} (${event.type}) has failed ${attempts} times in a row. ` +
          `Last error: ${message}`,
      );
      return;
    }

    this.logger.error(
      context,
      `Stripe webhook ${event.id} (${event.type}) failed (attempt ${attempts}): ${message}`,
    );
  }

  private async apply(tx: WebhookTransaction, event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case "payment_intent.succeeded":
        return this.onPaymentSucceeded(tx, event.data.object);
      case "payment_intent.amount_capturable_updated":
        return this.onAmountCapturableUpdated(tx, event.data.object);
      case "payment_intent.payment_failed":
        return this.onPaymentFailed(tx, event.data.object);
      case "payment_intent.canceled":
        return this.onPaymentCanceled(tx, event.data.object);
      case "charge.refunded":
        return this.onChargeRefunded(tx, event.data.object);
      case "charge.dispute.created":
        return this.onDisputeCreated(tx, event.data.object);
      default:
        this.logger.debug(`Ignoring unhandled Stripe event ${event.id} (${event.type})`);
    }
  }

  private async onPaymentSucceeded(
    tx: WebhookTransaction,
    intent: Stripe.PaymentIntent,
  ): Promise<void> {
    const payment = await this.resolvePayment(tx, intent);
    if (!payment) {
      throw new Error(`No payment row for PaymentIntent ${intent.id}`);
    }

    const captured = Math.min(
      typeof intent.amount_received === "number" && intent.amount_received > 0
        ? intent.amount_received
        : intent.amount,
      payment.amountMinor,
    );

    await tx.updatePaymentState(payment.id, {
      status: "paid",
      fromStatuses: ["pending", "authorized", "failed"],
      ...(payment.providerPaymentId ? {} : { providerPaymentId: intent.id }),
      capturedAmountMinor: captured,
      failureCode: null,
      failureMessage: null,
    });

    // The same canonical source key is used by the claim-call-settle capture path, so whichever
    // writer records the charge first wins and the other insert is a no-op.
    await tx.recordLedgerEntry({
      bookingId: payment.bookingId,
      paymentId: payment.id,
      entryType: "charge",
      sourceKey: `payment:${payment.id}:charge`,
      amountMinor: captured,
      currencyCode: payment.currencyCode,
      description: `Charge for payment ${payment.id}`,
    });

    const booking = await tx.findBooking(payment.bookingId);
    if (booking && ["cancelled", "failed", "expired"].includes(booking.status)) {
      this.logger.warn(
        `Payment ${payment.id} succeeded after booking ${booking.id} became ${booking.status}`,
      );
      await this.moveBooking(tx, booking.id, "needs_review", "payment succeeded after terminal");
      return;
    }

    await this.moveBooking(tx, payment.bookingId, "confirmed", "payment succeeded");
  }

  private async onAmountCapturableUpdated(
    tx: WebhookTransaction,
    intent: Stripe.PaymentIntent,
  ): Promise<void> {
    // Automatic-capture intents also emit this event with nothing capturable; only a real manual
    // authorization changes the booking.
    const capturable =
      intent.status === "requires_capture" ||
      (typeof intent.amount_capturable === "number" && intent.amount_capturable > 0);
    if (!capturable) return;

    const payment = await this.resolvePayment(tx, intent);
    if (!payment) {
      throw new Error(`No payment row for PaymentIntent ${intent.id}`);
    }

    await tx.updatePaymentState(payment.id, {
      status: "authorized",
      fromStatuses: ["pending", "failed"],
      ...(payment.providerPaymentId ? {} : { providerPaymentId: intent.id }),
      capturedAmountMinor: null,
      failureCode: null,
      failureMessage: null,
    });

    await this.moveBooking(tx, payment.bookingId, "authorized", "payment authorized");
  }

  private async onPaymentFailed(
    tx: WebhookTransaction,
    intent: Stripe.PaymentIntent,
  ): Promise<void> {
    const payment = await this.resolvePayment(tx, intent);
    if (!payment) {
      throw new Error(`No payment row for PaymentIntent ${intent.id}`);
    }

    const failure = intent.last_payment_error;
    await tx.updatePaymentState(payment.id, {
      status: "failed",
      // A failed attempt never downgrades an authorization that is waiting for capture.
      fromStatuses: ["pending", "failed"],
      ...(payment.providerPaymentId ? {} : { providerPaymentId: intent.id }),
      failureCode: failure?.code ?? "payment_failed",
      failureMessage: failure?.message ?? "PaymentIntent failed",
    });

    // The intent can still be retried with another payment method, so the booking keeps its
    // pending_payment hold until it succeeds or the expiry job closes it.
  }

  private async onPaymentCanceled(
    tx: WebhookTransaction,
    intent: Stripe.PaymentIntent,
  ): Promise<void> {
    const payment = await this.resolvePayment(tx, intent);
    if (!payment) {
      throw new Error(`No payment row for PaymentIntent ${intent.id}`);
    }

    await tx.updatePaymentState(payment.id, {
      status: "failed",
      fromStatuses: ["pending", "authorized", "failed"],
      ...(payment.providerPaymentId ? {} : { providerPaymentId: intent.id }),
      failureCode: "payment_intent.canceled",
      failureMessage: "PaymentIntent was canceled",
    });

    await this.moveBooking(tx, payment.bookingId, "cancelled", "payment intent canceled");
  }

  private async onChargeRefunded(tx: WebhookTransaction, charge: Stripe.Charge): Promise<void> {
    const intentId = paymentIntentId(charge);
    if (!intentId) {
      throw new Error(`Charge ${charge.id} has no PaymentIntent reference`);
    }

    const payment = await tx.findPaymentByProviderId(intentId);
    if (!payment) {
      throw new Error(`No payment row for PaymentIntent ${intentId}`);
    }

    const refunds = charge.refunds?.data ?? [];
    let recorded = false;
    for (const refund of refunds) {
      // Only money that actually moved is ledgered; a later event reports the success.
      if (refund.status !== "succeeded") continue;
      const refundRow = await tx.findPaymentByProviderId(refund.id);
      const entry = await tx.recordLedgerEntry({
        bookingId: payment.bookingId,
        paymentId: refundRow?.id ?? payment.id,
        entryType: "refund",
        // Keyed by the provider refund id, which is also the key the API refund path uses, so a
        // webhook racing our own refund call cannot record the money twice.
        sourceKey: `stripe_refund:${refund.id}`,
        amountMinor: refund.amount,
        currencyCode: payment.currencyCode,
        description: `Refund ${refund.id} for charge ${charge.id}`,
      });
      recorded = recorded || Boolean(entry);
    }

    if (refunds.length === 0) {
      // Some event versions omit the refund list. Fall back to the running total, keyed by the
      // total so redelivery of the same state is a no-op.
      const target = charge.amount_refunded;
      const alreadyRecorded = await tx.refundedMinor(payment.bookingId);
      const delta = target - alreadyRecorded;
      if (delta > 0) {
        await tx.recordLedgerEntry({
          bookingId: payment.bookingId,
          paymentId: payment.id,
          entryType: "refund",
          sourceKey: `stripe_charge:${charge.id}:refund:${target}`,
          amountMinor: delta,
          currencyCode: payment.currencyCode,
          description: `Refund total ${target} for charge ${charge.id}`,
        });
        recorded = true;
      }
    }

    if (!recorded) {
      this.logger.debug(`Charge ${charge.id} refunded state was already recorded`);
    }
  }

  private async onDisputeCreated(tx: WebhookTransaction, dispute: Stripe.Dispute): Promise<void> {
    const intentId =
      typeof dispute.payment_intent === "string"
        ? dispute.payment_intent
        : dispute.payment_intent?.id;
    if (!intentId) {
      throw new Error(`Dispute ${dispute.id} has no PaymentIntent reference`);
    }

    const payment = await tx.findPaymentByProviderId(intentId);
    if (!payment) {
      throw new Error(`No payment row for PaymentIntent ${intentId}`);
    }

    this.logger.error(
      `ALERT: Stripe dispute ${dispute.id} opened for payment ${payment.id} ` +
        `(booking ${payment.bookingId}, ${dispute.amount} ${dispute.currency})`,
    );

    await this.moveBooking(tx, payment.bookingId, "needs_review", "payment disputed");
  }

  private async resolvePayment(
    tx: WebhookTransaction,
    intent: Stripe.PaymentIntent,
  ): Promise<PaymentRecord | undefined> {
    const byProvider = await tx.findPaymentByProviderId(intent.id);
    if (byProvider) {
      if (byProvider.providerPaymentId && byProvider.providerPaymentId !== intent.id) {
        throw new Error(`Payment ${byProvider.id} already belongs to another PaymentIntent`);
      }
      return byProvider;
    }

    const bookingId = intent.metadata?.bookingId;
    if (typeof bookingId === "string" && isUuid(bookingId)) {
      const byKey = await tx.findPaymentByIdempotencyKey(`pi_${bookingId}`);
      if (byKey) {
        if (byKey.providerPaymentId && byKey.providerPaymentId !== intent.id) {
          throw new Error(`Payment ${byKey.id} already belongs to another PaymentIntent`);
        }
        return byKey;
      }
    }

    return undefined;
  }

  /**
   * Walks the legal state-machine path towards a target, re-reading after a conflict so concurrent
   * deliveries of different events converge on the same final state instead of fighting.
   */
  private async moveBooking(
    tx: WebhookTransaction,
    bookingId: string,
    target: BookingTarget,
    reason: string,
  ): Promise<void> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const booking = await tx.findBooking(bookingId);
      if (!booking) return;

      const step = nextStep(booking.status, target);
      if (!step) return;

      const moved = await tx.transitionBooking({
        bookingId,
        from: booking.status,
        to: step,
        actor: { type: "system", name: "stripe-webhook" },
        reason,
        metadata: { target },
      });
      if (!moved) continue;
    }

    this.logger.warn(`Booking ${bookingId} did not reach ${target} after concurrent updates`);
  }
}

function paymentIntentId(charge: Stripe.Charge): string | undefined {
  if (typeof charge.payment_intent === "string") return charge.payment_intent;
  return charge.payment_intent?.id;
}

/** One state-machine edge towards the target, or undefined when the target is already reached. */
function nextStep(from: BookingStatus, target: BookingTarget): BookingStatus | undefined {
  if (from === target) return undefined;

  switch (target) {
    case "authorized":
      return from === "pending_payment" ? "authorized" : undefined;
    case "confirmed":
      if (from === "pending_payment") return "confirming";
      if (from === "authorized" || from === "confirming") return "confirmed";
      return undefined;
    case "cancelled":
      return from === "pending_payment" || from === "authorized" ? "cancelled" : undefined;
    case "needs_review":
      return "needs_review";
  }
}
