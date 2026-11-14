import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type Stripe from "stripe";
import { CLOCK, type Clock } from "../../common/clock";
import {
  type BookingLedgerTotals,
  type BookingPaymentTotals,
  type DiscrepancyListFilters,
  type NewDiscrepancyInput,
  ReconciliationRepository,
} from "../../database/repositories/reconciliation.repository";
import { PaymentsRepository } from "../../database/repositories/payments.repository";
import { UsersRepository } from "../../database/repositories/users.repository";
import {
  localStatusFromIntentStatus,
  matchesIntentStatus,
} from "../../domain/payments/provider-status";
import { StripeService } from "../../integrations/stripe/stripe.service";
import { isMissingProviderResource } from "../payments/payments.service";
import { UpdateDiscrepancyDto } from "./dto/update-discrepancy.dto";

const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;
const PROVIDER = "stripe";

export type StripeReconciliationResult = {
  paymentsChecked: number;
  refundsChecked: number;
  providerIntentsChecked: number;
  found: number;
};

export type LedgerCheckResult = {
  bookingsChecked: number;
  violations: number;
};

/**
 * Compares local payment state with Stripe and audits the ledger. Findings are written to
 * `reconciliation_discrepancies` (deduplicated while open) and logged with an `ALERT:` prefix so
 * the current log-based alerting picks them up until an error tracker is wired in.
 */
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly config: ConfigService,
    private readonly stripe: StripeService,
    private readonly payments: PaymentsRepository,
    private readonly discrepancies: ReconciliationRepository,
    private readonly users: UsersRepository,
  ) {}

  private get lookbackHours(): number {
    return this.config.get<number>("jobs.reconcileLookbackHours") ?? 48;
  }

  private get batchSize(): number {
    return this.config.get<number>("jobs.reconcileBatchSize") ?? 200;
  }

  private get missingProviderGraceMinutes(): number {
    return this.config.get<number>("jobs.missingProviderGraceMinutes") ?? 60;
  }

  /** Reads recent Stripe PaymentIntents and refunds and records every difference it finds. */
  async reconcileStripe(jobId?: string): Promise<StripeReconciliationResult> {
    const now = this.clock.now();
    const since = new Date(now.getTime() - this.lookbackHours * HOUR_MS);
    const graceCutoff = new Date(now.getTime() - this.missingProviderGraceMinutes * 60_000);

    const [charges, refunds] = await Promise.all([
      this.payments.listOriginalSince(since, this.batchSize),
      this.payments.listRefundsSince(since, this.batchSize),
    ]);

    let found = 0;
    for (const charge of charges) {
      found += await this.compareCharge(charge.id);
    }
    for (const refund of refunds) {
      found += await this.compareRefund(refund.id);
    }

    // A local attempt that never produced a provider id cannot have charged anyone, but it is a
    // stuck attempt worth surfacing after the grace window.
    for (const charge of charges) {
      if (charge.providerPaymentId || charge.createdAt > graceCutoff) continue;
      if (charge.status === "paid") continue;
      found += await this.record({
        dedupeKey: `local_without_provider:${charge.id}`,
        kind: "local_without_provider",
        bookingId: charge.bookingId,
        paymentId: charge.id,
        details: {
          localStatus: charge.status,
          amountMinor: charge.amountMinor,
          createdAt: charge.createdAt.toISOString(),
        },
      });
    }

    const remote = await this.listProviderIntents(since);
    const providerIntentsChecked = remote.length;
    for (const intent of remote) {
      found += await this.compareRemoteIntent(intent);
    }

    if (found > 0) {
      this.logger.error(
        `ALERT: reconciliation ${jobId ?? "-"} recorded ${found} discrepancy finding(s)`,
      );
    } else {
      this.logger.debug(`Reconciliation ${jobId ?? "-"}: no differences`);
    }

    return {
      paymentsChecked: charges.length,
      refundsChecked: refunds.length,
      providerIntentsChecked,
      found,
    };
  }

  private async compareCharge(paymentId: string): Promise<number> {
    const payment = await this.payments.findById(paymentId);
    if (!payment || payment.provider !== PROVIDER || !payment.providerPaymentId) return 0;

    let intent: Stripe.PaymentIntent;
    try {
      intent = await this.stripe.client.paymentIntents.retrieve(payment.providerPaymentId, {
        expand: ["latest_charge"],
      });
    } catch (error) {
      if (!isMissingProviderResource(error)) throw error;
      return this.record({
        dedupeKey: `provider_missing:${payment.id}`,
        kind: "provider_missing",
        bookingId: payment.bookingId,
        paymentId: payment.id,
        providerReference: payment.providerPaymentId,
        details: { localStatus: payment.status, amountMinor: payment.amountMinor },
      });
    }

    let found = 0;
    const booking = await this.payments.findBooking(payment.bookingId);

    if (!matchesIntentStatus(payment.status, intent.status)) {
      found += await this.record({
        dedupeKey: `payment_status_mismatch:${payment.id}`,
        kind: "payment_status_mismatch",
        bookingId: payment.bookingId,
        paymentId: payment.id,
        providerReference: intent.id,
        details: {
          localStatus: payment.status,
          providerStatus: intent.status,
          expectedStatus: localStatusFromIntentStatus(intent.status) ?? "unknown",
          bookingStatus: booking?.status ?? null,
        },
      });
    }

    // Money moved but the booking is already terminal: the paid-without-booking case.
    if (
      intent.status === "succeeded" &&
      booking &&
      ["cancelled", "failed", "expired"].includes(booking.status)
    ) {
      found += await this.record({
        dedupeKey: `payment_status_mismatch:paid-without-active-booking:${payment.id}`,
        kind: "payment_status_mismatch",
        bookingId: payment.bookingId,
        paymentId: payment.id,
        providerReference: intent.id,
        details: {
          reason: "paid_without_active_booking",
          localStatus: payment.status,
          providerStatus: intent.status,
          bookingStatus: booking.status,
        },
      });
    }

    if (intent.status === "succeeded") {
      const providerCaptured =
        typeof intent.amount_received === "number" && intent.amount_received > 0
          ? intent.amount_received
          : intent.amount;
      const localCaptured = payment.capturedAmountMinor ?? payment.amountMinor;
      if (providerCaptured !== localCaptured) {
        found += await this.record({
          dedupeKey: `payment_amount_mismatch:${payment.id}`,
          kind: "payment_amount_mismatch",
          bookingId: payment.bookingId,
          paymentId: payment.id,
          providerReference: intent.id,
          details: {
            localCapturedMinor: localCaptured,
            providerCapturedMinor: providerCaptured,
            currency: payment.currencyCode,
          },
        });
      }
    }

    const charge = typeof intent.latest_charge === "object" ? intent.latest_charge : undefined;
    if (charge && typeof charge.amount_refunded === "number") {
      const totals = await this.payments.ledgerTotals(payment.bookingId);
      if (charge.amount_refunded !== totals.refundedMinor) {
        found += await this.record({
          dedupeKey: `refund_mismatch:${payment.id}`,
          kind: "refund_mismatch",
          bookingId: payment.bookingId,
          paymentId: payment.id,
          providerReference: charge.id,
          details: {
            localRefundedMinor: totals.refundedMinor,
            providerRefundedMinor: charge.amount_refunded,
            currency: payment.currencyCode,
          },
        });
      }
    }

    return found;
  }

  private async compareRefund(refundPaymentId: string): Promise<number> {
    const refund = await this.payments.findById(refundPaymentId);
    if (!refund || refund.originalPaymentId === null || !refund.providerPaymentId) return 0;

    let providerRefund: Stripe.Refund;
    try {
      providerRefund = await this.stripe.client.refunds.retrieve(refund.providerPaymentId);
    } catch (error) {
      if (!isMissingProviderResource(error)) throw error;
      return this.record({
        dedupeKey: `provider_missing:${refund.id}`,
        kind: "provider_missing",
        bookingId: refund.bookingId,
        paymentId: refund.id,
        providerReference: refund.providerPaymentId,
        details: { localStatus: refund.status, amountMinor: refund.amountMinor },
      });
    }

    const succeeded = providerRefund.status === "succeeded" || providerRefund.status === "pending";
    if (!succeeded || providerRefund.amount !== refund.amountMinor) {
      return this.record({
        dedupeKey: `refund_mismatch:${refund.id}`,
        kind: "refund_mismatch",
        bookingId: refund.bookingId,
        paymentId: refund.id,
        providerReference: providerRefund.id,
        details: {
          localStatus: refund.status,
          localAmountMinor: refund.amountMinor,
          providerStatus: providerRefund.status,
          providerAmountMinor: providerRefund.amount,
        },
      });
    }
    return 0;
  }

  /**
   * Looks for provider intents that our records do not know about. Only intents that represent
   * money at risk (succeeded or authorized) are reported.
   */
  private async compareRemoteIntent(intent: Stripe.PaymentIntent): Promise<number> {
    if (intent.status !== "succeeded" && intent.status !== "requires_capture") return 0;

    const local = await this.payments.findByProviderPaymentId(PROVIDER, intent.id);
    if (local) return 0;

    const bookingId = intent.metadata?.bookingId;
    const booking =
      typeof bookingId === "string" ? await this.payments.findBooking(bookingId) : undefined;

    return this.record({
      dedupeKey: `provider_without_local:${intent.id}`,
      kind: "provider_without_local",
      ...(booking ? { bookingId: booking.id } : {}),
      providerReference: intent.id,
      details: {
        providerStatus: intent.status,
        amountMinor: intent.amount,
        amountReceivedMinor: intent.amount_received ?? 0,
        currency: intent.currency.toUpperCase(),
        bookingId: typeof bookingId === "string" ? bookingId : null,
        bookingStatus: booking?.status ?? null,
      },
    });
  }

  private async listProviderIntents(since: Date): Promise<Stripe.PaymentIntent[]> {
    const results: Stripe.PaymentIntent[] = [];
    let startingAfter: string | undefined;
    const maxPages = 5;

    for (let page = 0; page < maxPages; page += 1) {
      const response = await this.stripe.client.paymentIntents.list({
        created: { gte: Math.floor(since.getTime() / 1_000) },
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });
      results.push(...response.data);
      if (!response.has_more || response.data.length === 0) break;
      startingAfter = response.data[response.data.length - 1]?.id;
      if (!startingAfter) break;
    }

    return results.slice(0, this.batchSize);
  }

  /**
   * Nightly audit: summed ledger rows must equal what the payment rows say was charged and
   * refunded. Each violating booking becomes one open discrepancy.
   */
  async checkLedger(jobId?: string): Promise<LedgerCheckResult> {
    const since = new Date(
      this.clock.now().getTime() -
        (this.config.get<number>("jobs.ledgerLookbackDays") ?? 30) * DAY_MS,
    );
    const batch = this.config.get<number>("jobs.ledgerBatchSize") ?? 1_000;

    const [recentLedger, recentPayments] = await Promise.all([
      this.discrepancies.ledgerTotalsSince(since, batch),
      this.discrepancies.paymentTotalsSince(since, batch),
    ]);

    const bookingIds = [
      ...new Set([...recentLedger, ...recentPayments].map((row) => row.bookingId)),
    ];
    if (bookingIds.length === 0) {
      this.logger.debug(`Ledger check ${jobId ?? "-"}: no activity to audit`);
      return { bookingsChecked: 0, violations: 0 };
    }

    // Re-read both sides for exactly those bookings: a charge written before the window still
    // counts against a refund written inside it.
    const [ledger, expected] = await Promise.all([
      this.discrepancies.ledgerTotalsForBookings(bookingIds),
      this.discrepancies.paymentTotalsForBookings(bookingIds),
    ]);

    const ledgerByBooking = new Map<string, BookingLedgerTotals>(
      ledger.map((row) => [row.bookingId, row]),
    );
    const expectedByBooking = new Map<string, BookingPaymentTotals>(
      expected.map((row) => [row.bookingId, row]),
    );

    let violations = 0;
    for (const bookingId of bookingIds) {
      const actual = ledgerByBooking.get(bookingId) ?? {
        bookingId,
        chargedMinor: 0,
        refundedMinor: 0,
        feesMinor: 0,
        adjustmentsMinor: 0,
      };
      const wanted = expectedByBooking.get(bookingId) ?? {
        bookingId,
        chargedMinor: 0,
        refundedMinor: 0,
      };

      if (
        actual.chargedMinor === wanted.chargedMinor &&
        actual.refundedMinor === wanted.refundedMinor
      ) {
        continue;
      }

      violations += 1;
      await this.record({
        dedupeKey: `ledger_mismatch:${bookingId}`,
        kind: "ledger_mismatch",
        bookingId,
        details: {
          ledgerChargedMinor: actual.chargedMinor,
          expectedChargedMinor: wanted.chargedMinor,
          ledgerRefundedMinor: actual.refundedMinor,
          expectedRefundedMinor: wanted.refundedMinor,
          ledgerFeesMinor: actual.feesMinor,
          ledgerAdjustmentsMinor: actual.adjustmentsMinor,
        },
      });
    }

    if (violations > 0) {
      this.logger.error(
        `ALERT: ledger check ${jobId ?? "-"} found ${violations} violating booking(s) of ${bookingIds.length}`,
      );
    } else {
      this.logger.log(`Ledger check ${jobId ?? "-"}: ${bookingIds.length} booking(s) balanced`);
    }
    return { bookingsChecked: bookingIds.length, violations };
  }

  private async record(input: NewDiscrepancyInput): Promise<number> {
    const row = await this.discrepancies.record(input);
    if (!row) return 0;
    this.logger.warn(
      `ALERT: reconciliation ${input.kind} for booking ${input.bookingId ?? "-"} ` +
        `payment ${input.paymentId ?? "-"} (${input.providerReference ?? "no provider reference"})`,
    );
    return 1;
  }

  /** Bounded open-finding list for #56's admin view. */
  async listOpenDiscrepancies(limit = 200) {
    return this.discrepancies.listOpen(limit);
  }

  /** Filtered queue for the admin UI, including closed history. */
  async listDiscrepancies(filters: DiscrepancyListFilters = {}) {
    return this.discrepancies.listForAdmin(filters);
  }

  /**
   * Assigns or closes one finding. Closing needs a written resolution and records the operator;
   * a closed finding is immutable from the application, so history cannot be rewritten.
   */
  async updateDiscrepancy(id: string, dto: UpdateDiscrepancyDto, actorUserId: string) {
    const changesAssignment = Object.prototype.hasOwnProperty.call(dto, "assignedToUserId");
    if (!dto.status && !changesAssignment) {
      throw new BadRequestException("Provide a status or an assignee");
    }
    if (dto.status && !dto.resolution) {
      throw new BadRequestException("A resolution is required to close a finding");
    }
    if (!dto.status && dto.resolution) {
      throw new BadRequestException("A resolution is only accepted when closing a finding");
    }

    const existing = await this.discrepancies.findById(id);
    if (!existing) {
      throw new NotFoundException("Discrepancy not found");
    }
    if (existing.status !== "open") {
      throw new ConflictException("Discrepancy is already closed");
    }

    let updated = existing;

    if (changesAssignment) {
      const assignee = dto.assignedToUserId ?? null;
      if (assignee) {
        const user = await this.users.findById(assignee);
        if (!user) {
          throw new NotFoundException("Assignee not found");
        }
        if (user.role !== "admin") {
          throw new BadRequestException("Findings can only be assigned to an admin");
        }
      }
      updated = (await this.discrepancies.assign(id, assignee, actorUserId)) ?? updated;
    }

    if (dto.status) {
      const closed = await this.discrepancies.close(id, {
        status: dto.status,
        resolution: dto.resolution!,
        resolvedByUserId: actorUserId,
      });
      if (!closed) {
        throw new ConflictException("Discrepancy changed while it was being closed; retry");
      }
      updated = closed;
    }

    return updated;
  }
}
