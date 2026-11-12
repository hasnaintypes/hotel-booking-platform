import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IdempotencyRepository } from "../../database/repositories/idempotency.repository";
import { InboxRepository } from "../../database/repositories/inbox.repository";
import { OutboxRepository } from "../../database/repositories/outbox.repository";
import type { JobQueue } from "../../domain/jobs/job-queue";
import { OffersService } from "../inventory/offers.service";
import { BookingRecoveryService } from "../reconciliation/booking-recovery.service";
import { ReconciliationService } from "../reconciliation/reconciliation.service";
import { JOB_NAMES } from "./job-names";

const DAY_MS = 24 * 60 * 60 * 1_000;

/**
 * Scheduled entry points. Each one delegates to a service that is safe to run repeatedly and on
 * demand, so a manual admin trigger and a cron run behave identically.
 */
@Injectable()
export class JobHandlers {
  private readonly logger = new Logger(JobHandlers.name);

  constructor(
    private readonly recovery: BookingRecoveryService,
    private readonly reconciliation: ReconciliationService,
    private readonly outbox: OutboxRepository,
    private readonly inbox: InboxRepository,
    private readonly idempotency: IdempotencyRepository,
    private readonly offers: OffersService,
    private readonly config: ConfigService,
  ) {}

  async register(queue: JobQueue): Promise<void> {
    await queue.handle(JOB_NAMES.expirePendingBookings, async (job) => {
      await this.recovery.expirePendingBookings(job.id);
    });
    await queue.handle(JOB_NAMES.sweepStuckBookings, async (job) => {
      await this.recovery.sweepStuckStates(job.id);
    });
    await queue.handle(JOB_NAMES.reconcilePayments, async (job) => {
      await this.reconciliation.reconcileStripe(job.id);
    });
    await queue.handle(JOB_NAMES.checkLedger, async (job) => {
      await this.reconciliation.checkLedger(job.id);
    });
    await queue.handle(JOB_NAMES.cleanupPlatformTables, (job) => this.cleanup(job.id));
  }

  private async cleanup(jobId: string): Promise<void> {
    const retentionDays = this.config.get<number>("jobs.retentionDays") ?? 30;
    const cutoff = new Date(Date.now() - retentionDays * DAY_MS);
    const [outbox, inbox, idempotency, offers] = await Promise.all([
      this.outbox.deleteDispatchedBefore(cutoff),
      this.inbox.deleteProcessedBefore(cutoff),
      this.idempotency.deleteExpiredBefore(new Date()),
      this.offers.cleanupExpired(),
    ]);

    this.logger.log(
      `Cleanup ${jobId}: removed ${outbox} dispatched outbox row(s), ${inbox} processed inbox ` +
        `row(s), ${idempotency} expired idempotency key(s) and ${offers} expired offer(s)`,
    );
  }
}
