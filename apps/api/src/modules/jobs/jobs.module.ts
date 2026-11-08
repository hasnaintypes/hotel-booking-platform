import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DatabaseRepositoriesModule } from "../../database/repositories/repositories.module";
import { OutboxRepository } from "../../database/repositories/outbox.repository";
import { JobHandlers } from "./job-handlers.service";
import { JOB_QUEUE, JOB_QUEUE_SETTINGS, type JobQueueSettings } from "./job-queue.settings";
import { JobWorkerService } from "./job-worker.service";
import { PgBossJobQueue } from "./pg-boss-job-queue";

const integer = (config: ConfigService, key: string): number => config.getOrThrow<number>(key);

@Module({
  imports: [DatabaseRepositoriesModule],
  providers: [
    {
      provide: JOB_QUEUE_SETTINGS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): JobQueueSettings => ({
        databaseUrl: config.getOrThrow<string>("database.url"),
        schema: config.getOrThrow<string>("jobs.schema"),
        workerEnabled: config.getOrThrow<boolean>("jobs.workerEnabled"),
        outboxPollIntervalMs: integer(config, "jobs.outboxPollIntervalMs"),
        outboxBatchSize: integer(config, "jobs.outboxBatchSize"),
        outboxMaxAttempts: integer(config, "jobs.outboxMaxAttempts"),
        outboxRetryDelayMs: integer(config, "jobs.outboxRetryDelayMs"),
        outboxRetryDelayMaxMs: integer(config, "jobs.outboxRetryDelayMaxMs"),
        outboxLockTimeoutMs: integer(config, "jobs.outboxLockTimeoutMs"),
        retryLimit: integer(config, "jobs.retryLimit"),
        retryDelaySeconds: integer(config, "jobs.retryDelaySeconds"),
        retryDelayMaxSeconds: integer(config, "jobs.retryDelayMaxSeconds"),
        expireInSeconds: integer(config, "jobs.expireInSeconds"),
        deleteAfterSeconds: integer(config, "jobs.deleteAfterSeconds"),
        localConcurrency: integer(config, "jobs.localConcurrency"),
        pollingIntervalSeconds: integer(config, "jobs.pollingIntervalSeconds"),
        deadLetterSuffix: config.getOrThrow<string>("jobs.deadLetterSuffix"),
        shutdownTimeoutMs: integer(config, "jobs.shutdownTimeoutMs"),
      }),
    },
    {
      provide: JOB_QUEUE,
      inject: [JOB_QUEUE_SETTINGS, OutboxRepository],
      useFactory: (settings: JobQueueSettings, outbox: OutboxRepository) =>
        new PgBossJobQueue(settings, outbox),
    },
    JobHandlers,
    JobWorkerService,
  ],
  exports: [JOB_QUEUE, JobHandlers],
})
export class JobsModule {}
