export type JobQueueSettings = {
  databaseUrl: string;
  schema: string;
  workerEnabled: boolean;
  outboxPollIntervalMs: number;
  outboxBatchSize: number;
  outboxMaxAttempts: number;
  outboxRetryDelayMs: number;
  outboxRetryDelayMaxMs: number;
  outboxLockTimeoutMs: number;
  retryLimit: number;
  retryDelaySeconds: number;
  retryDelayMaxSeconds: number;
  expireInSeconds: number;
  deleteAfterSeconds: number;
  localConcurrency: number;
  pollingIntervalSeconds: number;
  deadLetterSuffix: string;
  shutdownTimeoutMs: number;
};

export const JOB_QUEUE_SETTINGS = Symbol("JOB_QUEUE_SETTINGS");

export const JOB_QUEUE = Symbol("JOB_QUEUE");
