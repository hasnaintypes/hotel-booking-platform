import type { Database, Transaction } from "@hotel-booking/db";

export type JobPayload = Record<string, unknown>;

export type JobEnqueueOptions = {
  id?: string;
  priority?: number;
  startAfter?: Date | string | number;
  singletonKey?: string;
  retryLimit?: number;
  retryDelay?: number;
  retryBackoff?: boolean;
  retryDelayMax?: number;
  expireInSeconds?: number;
  deadLetter?: string;
};

export type JobHandlerOptions = {
  retryLimit?: number;
  retryDelay?: number;
  retryBackoff?: boolean;
  retryDelayMax?: number;
  expireInSeconds?: number;
  deadLetter?: string;
  localConcurrency?: number;
  pollingIntervalSeconds?: number;
};

export type JobContext<TData extends JobPayload = JobPayload> = {
  id: string;
  name: string;
  data: TData;
  retryCount: number;
  signal: AbortSignal;
};

export type JobHandler<TData extends JobPayload = JobPayload> = (
  job: JobContext<TData>,
) => Promise<void>;

export type JobScheduleOptions = JobEnqueueOptions & {
  timezone?: string;
  key?: string;
};

export type JobQueueMetrics = {
  enabled: boolean;
  queues: Array<{
    name: string;
    queued: number;
    active: number;
    failed: number;
    oldestReadySeconds: number | null;
  }>;
  totals: {
    queued: number;
    active: number;
    failed: number;
    oldestReadySeconds: number | null;
  };
  outbox: {
    pending: number;
    dispatching: number;
    failed: number;
    oldestPendingSeconds: number | null;
  };
};

export type JobQueueExecutor = Database | Transaction;

/**
 * Replaceable job-queue contract. The PostgreSQL implementation uses pg-boss, but application code
 * only depends on this interface so the backend can change without touching callers.
 */
export interface JobQueue {
  /** Connects the queue client without starting workers or the outbox relay. */
  start(): Promise<void>;
  /** Registers handlers/schedules and starts the outbox relay plus workers. */
  startWorker(): Promise<void>;
  stop(): Promise<void>;

  enqueue(name: string, data?: JobPayload, options?: JobEnqueueOptions): Promise<string | null>;
  /** Writes to `outbox_events` in the caller's transaction; the relay delivers it after commit. */
  enqueueInTransaction(
    executor: JobQueueExecutor,
    name: string,
    data?: JobPayload,
    options?: JobEnqueueOptions,
  ): Promise<string>;

  schedule(
    name: string,
    cron: string,
    data?: JobPayload,
    options?: JobScheduleOptions,
  ): Promise<void>;
  handle(name: string, handler: JobHandler, options?: JobHandlerOptions): Promise<void>;

  /** Drains committed outbox rows once. The worker loop calls this on an interval. */
  dispatchOutbox(): Promise<number>;
  metrics(): Promise<JobQueueMetrics>;
}
