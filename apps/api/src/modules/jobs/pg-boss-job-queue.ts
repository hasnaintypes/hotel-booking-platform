import { Logger } from "@nestjs/common";
import type { Job, PgBoss } from "pg-boss" with { "resolution-mode": "import" };
import { OutboxRepository } from "../../database/repositories/outbox.repository";
import type {
  JobContext,
  JobEnqueueOptions,
  JobHandler,
  JobHandlerOptions,
  JobPayload,
  JobQueue,
  JobQueueExecutor,
  JobQueueMetrics,
  JobScheduleOptions,
} from "../../domain/jobs/job-queue";
import type { JobQueueSettings } from "./job-queue.settings";

type RegisteredHandler = {
  handler: JobHandler;
  options: JobHandlerOptions;
};

type RegisteredSchedule = {
  cron: string;
  data: JobPayload;
  options: JobScheduleOptions;
};

type QueueConfig = {
  retryLimit: number;
  retryDelay: number;
  retryBackoff: boolean;
  retryDelayMax?: number;
  expireInSeconds: number;
  deleteAfterSeconds: number;
  deadLetter?: string;
};

/**
 * pg-boss adapter. Business transactions write to the outbox; this adapter relays those rows to
 * pg-boss after commit, runs handlers and exposes queue/outbox health for the admin console.
 */
export class PgBossJobQueue implements JobQueue {
  private readonly logger = new Logger(PgBossJobQueue.name);
  private boss: PgBoss | null = null;
  private startPromise: Promise<void> | null = null;
  private workerStarted = false;
  private stopping = false;
  private dispatcherTimer: NodeJS.Timeout | null = null;
  private dispatching = false;
  private readonly handlers = new Map<string, RegisteredHandler>();
  private readonly schedules = new Map<string, RegisteredSchedule>();
  private readonly queueNames = new Set<string>();

  constructor(
    private readonly settings: JobQueueSettings,
    private readonly outbox: OutboxRepository,
  ) {}

  async start(): Promise<void> {
    if (this.boss) return;
    if (!this.startPromise) {
      this.startPromise = this.doStart().catch((error) => {
        this.startPromise = null;
        throw error;
      });
    }
    await this.startPromise;
  }

  private async doStart(): Promise<void> {
    const { PgBoss } = await import("pg-boss");
    const boss = new PgBoss({
      connectionString: this.settings.databaseUrl,
      schema: this.settings.schema,
      application_name: "hotel-booking-jobs",
      schedule: this.settings.workerEnabled,
      supervise: this.settings.workerEnabled,
    });

    boss.on("error", (error) => {
      this.logger.error(`pg-boss error: ${error.message}`, error.stack);
    });

    await boss.start({ attempts: 3 });
    this.boss = boss;
    this.stopping = false;
    this.logger.log(
      `Job queue connected (schema ${this.settings.schema}, worker ${this.settings.workerEnabled ? "enabled" : "disabled"})`,
    );
  }

  async startWorker(): Promise<void> {
    await this.start();
    if (this.workerStarted) return;
    this.stopping = false;

    for (const [name, registration] of this.handlers) {
      await this.registerWorker(name, registration);
    }
    for (const [name, schedule] of this.schedules) {
      await this.registerSchedule(name, schedule);
    }

    this.workerStarted = true;
    this.startDispatcher();
    this.logger.log(
      `Job worker started with ${this.handlers.size} handler(s) and ${this.schedules.size} schedule(s)`,
    );
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.dispatcherTimer) {
      clearTimeout(this.dispatcherTimer);
      this.dispatcherTimer = null;
    }

    const boss = this.boss;
    this.boss = null;
    this.startPromise = null;
    this.workerStarted = false;
    this.queueNames.clear();

    if (!boss) return;

    try {
      await boss.stop({
        graceful: true,
        timeout: this.settings.shutdownTimeoutMs,
        close: true,
      });
      this.logger.log("Job queue stopped");
    } catch (error) {
      this.logger.error(
        `Job queue shutdown failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async enqueue(
    name: string,
    data: JobPayload = {},
    options: JobEnqueueOptions = {},
  ): Promise<string | null> {
    await this.start();
    await this.ensureQueue(name);
    return this.boss!.send(name, data, this.toSendOptions(options));
  }

  async enqueueInTransaction(
    executor: JobQueueExecutor,
    name: string,
    data: JobPayload = {},
    options: JobEnqueueOptions = {},
  ): Promise<string> {
    const availableAt =
      options.startAfter instanceof Date
        ? options.startAfter
        : typeof options.startAfter === "number"
          ? new Date(Date.now() + options.startAfter * 1_000)
          : typeof options.startAfter === "string"
            ? new Date(options.startAfter)
            : undefined;
    const event = await this.outbox.enqueue(executor, {
      topic: name,
      payload: data,
      availableAt,
    });
    return event.id;
  }

  async schedule(
    name: string,
    cron: string,
    data: JobPayload = {},
    options: JobScheduleOptions = {},
  ): Promise<void> {
    this.schedules.set(name, { cron, data, options });
    if (this.workerStarted) {
      await this.registerSchedule(name, { cron, data, options });
    }
  }

  async handle(name: string, handler: JobHandler, options: JobHandlerOptions = {}): Promise<void> {
    this.handlers.set(name, { handler, options });
    if (this.workerStarted) {
      await this.registerWorker(name, { handler, options });
    }
  }

  private async registerWorker(name: string, registration: RegisteredHandler): Promise<void> {
    const boss = this.boss;
    if (!boss) throw new Error("Job queue has not started");
    const options = registration.options;

    await this.ensureQueue(name, options);
    await boss.work<JobPayload>(
      name,
      {
        batchSize: 1,
        localConcurrency: options.localConcurrency ?? this.settings.localConcurrency,
        pollingIntervalSeconds:
          options.pollingIntervalSeconds ?? this.settings.pollingIntervalSeconds,
      },
      async ([job]) => {
        await registration.handler(this.toContext(job));
      },
    );
  }

  private async registerSchedule(name: string, schedule: RegisteredSchedule): Promise<void> {
    const boss = this.boss;
    if (!boss) throw new Error("Job queue has not started");
    await this.ensureQueue(name);
    await boss.schedule(name, schedule.cron, schedule.data, {
      ...this.toSendOptions(schedule.options),
      ...(schedule.options.timezone ? { tz: schedule.options.timezone } : {}),
      ...(schedule.options.key ? { key: schedule.options.key } : {}),
      missed: "once",
    });
  }

  private toContext(job: Job<JobPayload>): JobContext {
    return {
      id: job.id,
      name: job.name,
      data: job.data ?? {},
      retryCount: job.retryCount,
      signal: job.signal,
    };
  }

  private toSendOptions(options: JobEnqueueOptions): Record<string, unknown> {
    return {
      ...(options.id ? { id: options.id } : {}),
      ...(options.priority !== undefined ? { priority: options.priority } : {}),
      ...(options.startAfter !== undefined ? { startAfter: options.startAfter } : {}),
      ...(options.singletonKey ? { singletonKey: options.singletonKey } : {}),
      ...(options.retryLimit !== undefined ? { retryLimit: options.retryLimit } : {}),
      ...(options.retryDelay !== undefined ? { retryDelay: options.retryDelay } : {}),
      ...(options.retryBackoff !== undefined ? { retryBackoff: options.retryBackoff } : {}),
      ...(options.retryDelayMax !== undefined ? { retryDelayMax: options.retryDelayMax } : {}),
      ...(options.expireInSeconds !== undefined
        ? { expireInSeconds: options.expireInSeconds }
        : {}),
      ...(options.deadLetter ? { deadLetter: options.deadLetter } : {}),
    };
  }

  private queueConfig(name: string, options: JobHandlerOptions = {}): QueueConfig {
    const deadLetter =
      options.deadLetter === undefined
        ? this.deadLetterQueueName(name)
        : options.deadLetter || undefined;
    const retryBackoff = options.retryBackoff ?? true;
    const retryDelayMax = retryBackoff
      ? (options.retryDelayMax ?? this.settings.retryDelayMaxSeconds)
      : undefined;
    return {
      retryLimit: options.retryLimit ?? this.settings.retryLimit,
      retryDelay: options.retryDelay ?? this.settings.retryDelaySeconds,
      retryBackoff,
      ...(retryDelayMax !== undefined ? { retryDelayMax } : {}),
      expireInSeconds: options.expireInSeconds ?? this.settings.expireInSeconds,
      deleteAfterSeconds: this.settings.deleteAfterSeconds,
      ...(deadLetter ? { deadLetter } : {}),
    };
  }

  private deadLetterQueueName(name: string): string {
    return `${name}${this.settings.deadLetterSuffix}`;
  }

  private async ensureQueue(name: string, options: JobHandlerOptions = {}): Promise<void> {
    const boss = this.boss;
    if (!boss) throw new Error("Job queue has not started");
    if (this.queueNames.has(name)) return;

    const config = this.queueConfig(name, options);
    if (config.deadLetter) {
      const deadLetter = config.deadLetter;
      if (!this.queueNames.has(deadLetter)) {
        await boss.createQueue(deadLetter, {
          retryLimit: 0,
          retryDelay: 0,
          deleteAfterSeconds: this.settings.deleteAfterSeconds,
        });
        this.queueNames.add(deadLetter);
      }
    }

    await boss.createQueue(name, config);
    this.queueNames.add(name);
  }

  async dispatchOutbox(): Promise<number> {
    if (this.dispatching) return 0;
    this.dispatching = true;
    try {
      await this.start();
      const events = await this.outbox.claim(
        this.settings.outboxBatchSize,
        this.settings.outboxLockTimeoutMs,
      );
      let relayed = 0;

      for (const event of events) {
        try {
          await this.ensureQueue(event.topic);
          const jobId = await this.boss!.send(event.topic, event.payload as JobPayload, {
            id: event.id,
          });
          if (jobId === null) {
            this.logger.warn(`Outbox event ${event.id} was already present in the queue`);
          }
          await this.outbox.markDispatched(event.id);
          relayed += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (event.attempts >= this.settings.outboxMaxAttempts) {
            await this.outbox.markFailed(event.id, message);
            this.logger.error(
              `Outbox event ${event.id} (${event.topic}) failed permanently after ${event.attempts} attempts: ${message}`,
            );
          } else {
            const delayMs = Math.min(
              this.settings.outboxRetryDelayMaxMs,
              this.settings.outboxRetryDelayMs * 2 ** Math.min(event.attempts - 1, 10),
            );
            await this.outbox.markPending(event.id, message, new Date(Date.now() + delayMs));
            this.logger.warn(
              `Outbox event ${event.id} (${event.topic}) retry ${event.attempts} in ${delayMs}ms: ${message}`,
            );
          }
        }
      }

      return relayed;
    } finally {
      this.dispatching = false;
    }
  }

  private startDispatcher(): void {
    if (this.dispatcherTimer || this.stopping) return;
    const run = async () => {
      if (this.stopping) return;
      try {
        const relayed = await this.dispatchOutbox();
        if (relayed > 0) this.logger.debug(`Relayed ${relayed} outbox event(s)`);
      } catch (error) {
        this.logger.error(
          `Outbox relay failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (!this.stopping) {
        this.dispatcherTimer = setTimeout(run, this.settings.outboxPollIntervalMs);
        this.dispatcherTimer.unref();
      }
    };
    void run();
  }

  async metrics(): Promise<JobQueueMetrics> {
    await this.start();
    const [queues, outbox] = await Promise.all([this.boss!.getQueues(), this.outbox.metrics()]);

    const queueMetrics = await Promise.all(
      queues.map(async (queue) => {
        const [stats] = await this.boss!.getQueueStats(queue.name, { force: true });
        return {
          name: queue.name,
          queued: Number(stats?.queuedCount ?? 0),
          active: Number(stats?.activeCount ?? 0),
          failed: Number(stats?.failedCount ?? 0),
          oldestReadySeconds:
            stats?.readyOldestSeconds === null || stats?.readyOldestSeconds === undefined
              ? null
              : Number(stats.readyOldestSeconds),
        };
      }),
    );

    return {
      enabled: this.settings.workerEnabled,
      queues: queueMetrics,
      totals: {
        queued: queueMetrics.reduce((total, queue) => total + queue.queued, 0),
        active: queueMetrics.reduce((total, queue) => total + queue.active, 0),
        failed: queueMetrics.reduce((total, queue) => total + queue.failed, 0),
        oldestReadySeconds: queueMetrics.reduce<number | null>((oldest, queue) => {
          if (queue.oldestReadySeconds === null) return oldest;
          return oldest === null
            ? queue.oldestReadySeconds
            : Math.max(oldest, queue.oldestReadySeconds);
        }, null),
      },
      outbox,
    };
  }
}
