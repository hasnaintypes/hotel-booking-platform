import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BookingsRepository } from "../../database/repositories/bookings.repository";
import { InboxRepository } from "../../database/repositories/inbox.repository";
import { OutboxRepository } from "../../database/repositories/outbox.repository";
import { BookingTransitionConflictError } from "../../domain/bookings/booking-state-machine";
import type { JobQueue } from "../../domain/jobs/job-queue";
import { JOB_NAMES } from "./job-names";

const MINUTE_MS = 60 * 1_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/**
 * Default background handlers. Each is safe to run repeatedly: the expiry transition is conditional
 * on the booking still being `pending_payment`, and the cleanup jobs delete only old, terminal rows.
 */
@Injectable()
export class JobHandlers {
  private readonly logger = new Logger(JobHandlers.name);

  constructor(
    private readonly bookings: BookingsRepository,
    private readonly outbox: OutboxRepository,
    private readonly inbox: InboxRepository,
    private readonly config: ConfigService,
  ) {}

  async register(queue: JobQueue): Promise<void> {
    await queue.handle(JOB_NAMES.expirePendingBookings, (job) =>
      this.expirePendingBookings(job.id),
    );
    await queue.handle(JOB_NAMES.reconcilePayments, (job) => this.reconcilePayments(job.id));
    await queue.handle(JOB_NAMES.cleanupPlatformTables, (job) => this.cleanup(job.id));
  }

  private async expirePendingBookings(jobId: string): Promise<void> {
    const holdMinutes = this.config.get<number>("jobs.paymentHoldMinutes") ?? 30;
    const cutoff = new Date(Date.now() - holdMinutes * MINUTE_MS);
    const candidates = await this.bookings.listPendingPaymentBefore(cutoff);

    let expired = 0;
    for (const booking of candidates) {
      try {
        await this.bookings.transition({
          bookingId: booking.id,
          from: "pending_payment",
          to: "expired",
          actor: { type: "system", name: "booking-expiry" },
          reason: `payment hold expired after ${holdMinutes} minutes`,
          metadata: { jobId },
        });
        expired += 1;
      } catch (error) {
        if (error instanceof BookingTransitionConflictError) continue;
        this.logger.error(
          `Expiry failed for booking ${booking.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.logger.log(`Expired ${expired} of ${candidates.length} pending booking(s)`);
  }

  private async reconcilePayments(jobId: string): Promise<void> {
    const staleMinutes = this.config.get<number>("jobs.reconcileStaleMinutes") ?? 60;
    const cutoff = new Date(Date.now() - staleMinutes * MINUTE_MS);
    const counts = await this.bookings.reconciliationCounts(cutoff);

    if (Object.values(counts).every((value) => value === 0)) {
      this.logger.debug(`Reconciliation ${jobId}: nothing stale`);
      return;
    }

    this.logger.warn(
      `Reconciliation ${jobId}: stale work older than ${staleMinutes}m ${JSON.stringify(counts)}`,
    );
  }

  private async cleanup(jobId: string): Promise<void> {
    const retentionDays = this.config.get<number>("jobs.retentionDays") ?? 30;
    const cutoff = new Date(Date.now() - retentionDays * DAY_MS);
    const [outbox, inbox] = await Promise.all([
      this.outbox.deleteDispatchedBefore(cutoff),
      this.inbox.deleteProcessedBefore(cutoff),
    ]);

    this.logger.log(
      `Cleanup ${jobId}: removed ${outbox} dispatched outbox row(s) and ${inbox} processed inbox row(s)`,
    );
  }
}
