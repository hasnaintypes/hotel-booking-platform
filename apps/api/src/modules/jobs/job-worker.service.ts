import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { JobQueue } from "../../domain/jobs/job-queue";
import { JOB_QUEUE } from "./job-queue.settings";
import { JobHandlers } from "./job-handlers.service";
import { registerSchedules } from "./job-schedules";

/** Boots the in-process worker only when RUN_WORKER=true. */
@Injectable()
export class JobWorkerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(JobWorkerService.name);
  private started = false;

  constructor(
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
    private readonly handlers: JobHandlers,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.get<boolean>("jobs.workerEnabled")) {
      this.logger.log("Background worker disabled (set RUN_WORKER=true to enable)");
      return;
    }

    await this.handlers.register(this.queue);
    await registerSchedules(this.queue, {
      expiryCron: this.config.get<string>("jobs.schedules.expiry")!,
      sweepCron: this.config.get<string>("jobs.schedules.sweep")!,
      reconcileCron: this.config.get<string>("jobs.schedules.reconcile")!,
      ledgerCron: this.config.get<string>("jobs.schedules.ledger")!,
      cleanupCron: this.config.get<string>("jobs.schedules.cleanup")!,
    });
    await this.queue.startWorker();
    this.started = true;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue.stop();
    this.started = false;
  }
}
