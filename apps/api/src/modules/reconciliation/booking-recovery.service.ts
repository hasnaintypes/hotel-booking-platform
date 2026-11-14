import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CLOCK, type Clock } from "../../common/clock";
import {
  BookingsRepository,
  type BookingWithPayments,
} from "../../database/repositories/bookings.repository";
import {
  BookingTransitionConflictError,
  type BookingStatus,
} from "../../domain/bookings/booking-state-machine";
import { PaymentsService } from "../payments/payments.service";

const MINUTE_MS = 60 * 1_000;

export type ExpiryResult = {
  candidates: number;
  expired: number;
  paid: number;
  failed: number;
};

export type SweepResult = {
  authorized: number;
  confirming: number;
  cancelling: number;
  recovered: number;
  unresolved: number;
};

/**
 * Repairs bookings whose normal flow stopped halfway. Every operation is idempotent and conditional
 * on the state it read: a sweeper racing a webhook or an operator loses cleanly instead of
 * overwriting the winner.
 */
@Injectable()
export class BookingRecoveryService {
  private readonly logger = new Logger(BookingRecoveryService.name);

  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly config: ConfigService,
    private readonly bookings: BookingsRepository,
    private readonly payments: PaymentsService,
  ) {}

  private get paymentHoldMinutes(): number {
    return this.config.get<number>("jobs.paymentHoldMinutes") ?? 30;
  }

  private staleCutoff(minutes: number): Date {
    return new Date(this.clock.now().getTime() - minutes * MINUTE_MS);
  }

  private batchSize(): number {
    return this.config.get<number>("jobs.sweepBatchSize") ?? 100;
  }

  /**
   * Closes `pending_payment` holds whose TTL elapsed and cancels the provider intent. If Stripe says
   * the payment already succeeded, the booking goes to `needs_review` rather than `expired`, so a
   * charged guest is never hidden by an expiry sweep.
   */
  async expirePendingBookings(jobId?: string): Promise<ExpiryResult> {
    const now = this.clock.now();
    const legacyCutoff = new Date(now.getTime() - this.paymentHoldMinutes * MINUTE_MS);
    const candidates = await this.bookings.listExpiredPendingPayment(
      now,
      legacyCutoff,
      this.batchSize(),
    );

    let expired = 0;
    let paid = 0;
    let failed = 0;

    for (const booking of candidates) {
      try {
        const outcome = await this.payments.releaseExpiredPayment(booking.id);
        if (outcome === "paid") {
          const moved = await this.transition(
            booking.id,
            "pending_payment",
            "needs_review",
            "payment succeeded after the hold expired",
            { jobId, source: "booking-expiry", outcome },
          );
          if (moved) paid += 1;
          this.logger.error(
            `ALERT: booking ${booking.id} was paid after its payment hold expired; parked for review`,
          );
          continue;
        }

        const moved = await this.transition(
          booking.id,
          "pending_payment",
          "expired",
          `payment hold expired after ${this.paymentHoldMinutes} minutes`,
          { jobId, source: "booking-expiry" },
        );
        if (moved) expired += 1;
      } catch (error) {
        failed += 1;
        this.logger.error(
          `Expiry failed for booking ${booking.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.logger.log(
      `Expiry ${jobId ?? "-"}: ${expired} expired, ${paid} paid-after-expiry, ${failed} failed ` +
        `of ${candidates.length} candidate(s)`,
    );
    return { candidates: candidates.length, expired, paid, failed };
  }

  /** Retries or parks bookings left in `authorized`, `confirming` or `cancelling`. */
  async sweepStuckStates(jobId?: string): Promise<SweepResult> {
    const [authorized, confirming, cancelling] = await Promise.all([
      this.bookings.listStaleByStatus(
        "authorized",
        this.staleCutoff(this.config.get<number>("jobs.authorizedStaleMinutes") ?? 15),
        this.batchSize(),
      ),
      this.bookings.listStaleByStatus(
        "confirming",
        this.staleCutoff(this.config.get<number>("jobs.confirmingStaleMinutes") ?? 15),
        this.batchSize(),
      ),
      this.bookings.listStaleByStatus(
        "cancelling",
        this.staleCutoff(this.config.get<number>("jobs.cancellingStaleMinutes") ?? 60),
        this.batchSize(),
      ),
    ]);

    const result: SweepResult = {
      authorized: authorized.length,
      confirming: confirming.length,
      cancelling: cancelling.length,
      recovered: 0,
      unresolved: 0,
    };

    for (const booking of authorized) {
      if (await this.recoverAuthorized(booking.id, jobId)) result.recovered += 1;
      else result.unresolved += 1;
    }
    for (const booking of confirming) {
      if (await this.recoverConfirming(booking.id, jobId)) result.recovered += 1;
      else result.unresolved += 1;
    }
    for (const booking of cancelling) {
      if (await this.recoverCancelling(booking.id, jobId)) result.recovered += 1;
      else result.unresolved += 1;
    }

    this.logger.log(
      `Sweep ${jobId ?? "-"}: authorized ${result.authorized}, confirming ${result.confirming}, ` +
        `cancelling ${result.cancelling}, recovered ${result.recovered}, ` +
        `unresolved ${result.unresolved}`,
    );
    return result;
  }

  /**
   * Manual recovery used by the admin `retry` action. It runs the same code path as the scheduled
   * sweeper for the booking's current status and reports where the booking ended up.
   */
  async recoverBooking(
    bookingId: string,
  ): Promise<{ recovered: boolean; status: BookingStatus | null }> {
    const record = await this.bookings.findById(bookingId);
    if (!record) return { recovered: false, status: null };

    const status = record.booking.status;
    const recovered =
      status === "authorized"
        ? await this.recoverAuthorized(bookingId)
        : status === "confirming"
          ? await this.recoverConfirming(bookingId)
          : status === "cancelling"
            ? await this.recoverCancelling(bookingId)
            : false;

    const after = await this.bookings.findById(bookingId);
    return { recovered, status: after?.booking.status ?? null };
  }

  private async recoverAuthorized(bookingId: string, jobId?: string): Promise<boolean> {
    const record = await this.bookings.findById(bookingId);
    if (!record || record.booking.status !== "authorized") return true;

    const settled = await this.settleCharge(record);
    if (!settled) {
      await this.park(record, "authorized", "authorized booking could not be settled", jobId);
      return false;
    }
    return this.advanceToConfirmed(bookingId, jobId);
  }

  private async recoverConfirming(bookingId: string, jobId?: string): Promise<boolean> {
    const record = await this.bookings.findById(bookingId);
    if (!record || record.booking.status !== "confirming") return true;

    const settled = await this.settleCharge(record);
    if (!settled) {
      await this.park(record, "confirming", "confirming booking could not be settled", jobId);
      return false;
    }
    return this.advanceToConfirmed(bookingId, jobId);
  }

  /**
   * Brings the charge to `paid`: reads the provider when the webhook may have been lost, then
   * captures an authorization. Returns false when the payment cannot be settled without a human.
   */
  private async settleCharge(record: BookingWithPayments): Promise<boolean> {
    let charge = record.payments.find((payment) => payment.originalPaymentId === null);
    if (!charge) return false;

    if (charge.status === "pending" && charge.providerPaymentId) {
      charge = (await this.payments.refreshFromProvider(charge.id)) ?? charge;
    }

    if (charge.status === "authorized") {
      try {
        charge = await this.payments.capturePayment(charge.id);
      } catch (error) {
        this.logger.warn(
          `Capture during recovery failed for booking ${record.booking.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return false;
      }
    }

    return charge.status === "paid";
  }

  private async advanceToConfirmed(bookingId: string, jobId?: string): Promise<boolean> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const record = await this.bookings.findById(bookingId);
      if (!record) return false;
      if (record.booking.status === "confirmed") return true;

      const status = record.booking.status;
      if (status !== "authorized" && status !== "confirming") return false;
      const next: BookingStatus = status === "authorized" ? "confirming" : "confirmed";

      const moved = await this.transition(
        bookingId,
        status,
        next,
        "stuck-state sweeper completed the payment flow",
        { jobId, source: "booking-recovery" },
      );
      if (moved) continue;
    }
    return false;
  }

  private async recoverCancelling(bookingId: string, jobId?: string): Promise<boolean> {
    const record = await this.bookings.findById(bookingId);
    if (!record || record.booking.status !== "cancelling") return true;

    const refunds = record.payments.filter((payment) => payment.originalPaymentId !== null);
    const refundedMinor = refunds
      .filter((payment) => payment.status === "refunded")
      .reduce((total, payment) => total + payment.amountMinor, 0);

    if (refundedMinor > 0) {
      return this.transition(
        bookingId,
        "cancelling",
        "cancelled",
        "cancellation completed after the refund settled",
        { jobId, source: "booking-recovery", refundedMinor },
      );
    }

    // A pending refund means Stripe may already hold the money; only an operator can resolve it.
    if (refunds.some((payment) => payment.status === "pending")) {
      await this.park(record, "cancelling", "cancellation refund outcome unknown", jobId);
      return false;
    }

    const charge = record.payments.find((payment) => payment.originalPaymentId === null);
    // Releasing an authorization is a provider mutation this sweeper does not own; parking is
    // safer than marking the booking cancelled while a card hold may still exist.
    if (
      charge?.providerPaymentId &&
      (charge.status === "authorized" || charge.status === "pending")
    ) {
      await this.park(record, "cancelling", "cancellation needs the provider hold released", jobId);
      return false;
    }
    if (charge?.status === "paid") {
      const plan = await this.bookings.cancellationIntent(bookingId);
      if (!plan) {
        await this.park(
          record,
          "cancelling",
          "cancelling booking has no frozen refund plan",
          jobId,
        );
        return false;
      }
      if (plan.amountMinor > 0) {
        try {
          await this.payments.refundBooking(bookingId, plan.amountMinor);
        } catch (error) {
          this.logger.warn(
            `Cancellation refund retry failed for booking ${bookingId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
            error instanceof Error ? error.stack : undefined,
          );
          await this.park(record, "cancelling", "cancellation refund retry failed", jobId);
          return false;
        }
      }
    }

    return this.transition(
      bookingId,
      "cancelling",
      "cancelled",
      "cancellation recovered by the stuck-state sweeper",
      { jobId, source: "booking-recovery" },
    );
  }

  private async park(
    record: BookingWithPayments,
    from: "authorized" | "confirming" | "cancelling",
    reason: string,
    jobId?: string,
  ): Promise<void> {
    const moved = await this.transition(record.booking.id, from, "needs_review", reason, {
      jobId,
      source: "booking-recovery",
    });
    if (moved) {
      this.logger.error(`ALERT: booking ${record.booking.id} parked for review: ${reason}`);
    }
  }

  private async transition(
    bookingId: string,
    from: BookingStatus,
    to: BookingStatus,
    reason: string,
    metadata: Record<string, unknown>,
  ): Promise<boolean> {
    try {
      await this.bookings.transition({
        bookingId,
        from,
        to,
        actor: { type: "system", name: "booking-recovery" },
        reason,
        metadata,
      });
      return true;
    } catch (error) {
      if (error instanceof BookingTransitionConflictError) return false;
      this.logger.error(
        `Recovery transition ${from}->${to} failed for booking ${bookingId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }
}
