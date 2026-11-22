import { JOB_TOPIC_VALUES } from "@hotel-booking/contracts";
import { describe, expect, it, vi } from "vitest";
import type { OutboxRepository } from "../../database/repositories/outbox.repository";
import type { JobQueueExecutor } from "../../domain/jobs/job-queue";
import { JOB_NAMES } from "./job-names";
import { PgBossJobQueue } from "./pg-boss-job-queue";
import type { JobQueueSettings } from "./job-queue.settings";

const settings: JobQueueSettings = {
  databaseUrl: "postgres://unused",
  schema: "pgboss",
  workerEnabled: false,
  outboxPollIntervalMs: 100,
  outboxBatchSize: 25,
  outboxMaxAttempts: 3,
  outboxRetryDelayMs: 100,
  outboxRetryDelayMaxMs: 500,
  outboxLockTimeoutMs: 5_000,
  retryLimit: 1,
  retryDelaySeconds: 0,
  retryDelayMaxSeconds: 1,
  expireInSeconds: 60,
  deleteAfterSeconds: 3_600,
  localConcurrency: 1,
  pollingIntervalSeconds: 1,
  deadLetterSuffix: ".dead-letter",
  shutdownTimeoutMs: 10_000,
};

const executor = {} as JobQueueExecutor;

const outboxStub = () => {
  const enqueue = vi.fn(async () => ({ id: "outbox-event" }));
  return { enqueue, outbox: { enqueue } as unknown as OutboxRepository };
};

describe("PgBossJobQueue payload validation", () => {
  it("keeps JOB_NAMES aligned with the contract topics", () => {
    expect([...Object.values(JOB_NAMES)].sort()).toEqual([...JOB_TOPIC_VALUES].sort());
  });

  it("validates a known topic before writing the outbox row", async () => {
    const { enqueue, outbox } = outboxStub();
    const queue = new PgBossJobQueue(settings, outbox);

    await queue.enqueueInTransaction(executor, JOB_NAMES.expirePendingBookings, {});

    expect(enqueue).toHaveBeenCalledWith(
      executor,
      expect.objectContaining({ topic: JOB_NAMES.expirePendingBookings, payload: {} }),
    );
  });

  it("rejects a bad payload for a known topic before touching the outbox", async () => {
    const { enqueue, outbox } = outboxStub();
    const queue = new PgBossJobQueue(settings, outbox);

    await expect(
      queue.enqueueInTransaction(executor, JOB_NAMES.checkLedger, { unexpected: true }),
    ).rejects.toThrow(JOB_NAMES.checkLedger);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("leaves an arbitrary queue name and payload untouched", async () => {
    const { enqueue, outbox } = outboxStub();
    const queue = new PgBossJobQueue(settings, outbox);

    await queue.enqueueInTransaction(executor, "test.jobs.arbitrary", { value: 1 });

    expect(enqueue).toHaveBeenCalledWith(
      executor,
      expect.objectContaining({ topic: "test.jobs.arbitrary", payload: { value: 1 } }),
    );
  });

  it("validates schedules when they are registered", async () => {
    const queue = new PgBossJobQueue(settings, outboxStub().outbox);

    await expect(
      queue.schedule(JOB_NAMES.cleanupPlatformTables, "* * * * *", { unexpected: true }),
    ).rejects.toThrow(JOB_NAMES.cleanupPlatformTables);
    await expect(
      queue.schedule(JOB_NAMES.cleanupPlatformTables, "* * * * *", {}),
    ).resolves.toBeUndefined();
    await expect(
      queue.schedule("test.jobs.arbitrary", "* * * * *", { value: 1 }),
    ).resolves.toBeUndefined();
  });

  it("validates a direct enqueue but leaves arbitrary queue names alone", async () => {
    const send = vi.fn(async () => "job-id");
    const queue = new PgBossJobQueue(settings, outboxStub().outbox);
    const internals = queue as unknown as {
      start: () => Promise<void>;
      boss: { createQueue: () => Promise<void>; send: typeof send };
    };
    internals.start = async () => {};
    internals.boss = { createQueue: async () => {}, send };

    await queue.enqueue(JOB_NAMES.reconcilePayments);
    expect(send).toHaveBeenCalledWith(JOB_NAMES.reconcilePayments, {}, expect.any(Object));

    await expect(queue.enqueue(JOB_NAMES.reconcilePayments, { unexpected: true })).rejects.toThrow(
      JOB_NAMES.reconcilePayments,
    );
    expect(send).toHaveBeenCalledTimes(1);

    await queue.enqueue("test.jobs.arbitrary", { value: 1 });
    expect(send).toHaveBeenLastCalledWith("test.jobs.arbitrary", { value: 1 }, expect.any(Object));
  });
});
