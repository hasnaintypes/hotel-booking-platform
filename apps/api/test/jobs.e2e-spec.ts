import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Database, type DatabaseHandle } from "@hotel-booking/db";
import { InboxRepository } from "../src/database/repositories/inbox.repository";
import { OutboxRepository } from "../src/database/repositories/outbox.repository";
import type { JobQueueSettings } from "../src/modules/jobs/job-queue.settings";
import { PgBossJobQueue } from "../src/modules/jobs/pg-boss-job-queue";

const url = process.env.TEST_DATABASE_URL;

const settings = (): JobQueueSettings => ({
  databaseUrl: url!,
  schema: "pgboss",
  workerEnabled: true,
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
});

const waitFor = async (
  predicate: () => Promise<boolean> | boolean,
  timeoutMs = 15_000,
  intervalMs = 100,
) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`condition not met within ${timeoutMs}ms`);
};

describe.skipIf(!url)("transactional outbox and pg-boss job runner", () => {
  let handle: DatabaseHandle;
  let db: Database;
  let outbox: OutboxRepository;
  let inbox: InboxRepository;
  let queue: PgBossJobQueue;
  let queueName: string;

  beforeAll(() => {
    handle = createDb({ connectionString: url! });
    db = handle.db;
    outbox = new OutboxRepository(db);
    inbox = new InboxRepository(db);
  });

  afterEach(async () => {
    await queue?.stop();
  });

  afterAll(async () => {
    await outbox?.clear();
    await inbox?.clear();
    await handle?.close();
  });

  const newQueue = async () => {
    queueName = `test.jobs.${randomUUID()}`;
    await outbox.clear();
    await inbox.clear();
    queue = new PgBossJobQueue(settings(), outbox);
    return queueName;
  };

  it("does not run a job whose transaction rolled back, and runs a committed one", async () => {
    const name = await newQueue();
    let runs = 0;
    let resolveRun = () => {};
    const ran = new Promise<void>((resolve) => {
      resolveRun = resolve;
    });

    await queue.handle(name, async () => {
      runs += 1;
      resolveRun();
    });
    await queue.startWorker();

    await expect(
      db.transaction(async (tx) => {
        await queue.enqueueInTransaction(tx, name, { value: "rolled-back" });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");

    await queue.dispatchOutbox();
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(runs).toBe(0);

    await db.transaction(async (tx) => {
      await queue.enqueueInTransaction(tx, name, { value: "committed" });
    });
    await queue.dispatchOutbox();
    await ran;
    expect(runs).toBe(1);
  });

  it("retries a throwing handler and then dead-letters it", async () => {
    const name = await newQueue();
    const deadLetter = `${name}.dead-letter`;
    let attempts = 0;

    await queue.handle(
      name,
      async () => {
        attempts += 1;
        throw new Error("handler failed");
      },
      { retryLimit: 1, retryDelay: 0, retryBackoff: false, deadLetter },
    );
    await queue.startWorker();
    await queue.enqueue(name, { value: "will-fail" });

    await waitFor(() => attempts >= 2);
    await waitFor(async () => {
      const result = await db.execute(
        sql`select count(*)::int as total from "pgboss"."job" where "name" = ${deadLetter}`,
      );
      return Number((result.rows[0] as { total: number }).total) === 1;
    });

    const source = await db.execute(
      sql`select "state", "retry_count" from "pgboss"."job" where "name" = ${name} order by "created_on" desc limit 1`,
    );
    expect(Number((source.rows[0] as { retry_count: number }).retry_count)).toBe(1);
    expect((source.rows[0] as { state: string }).state).toBe("failed");
  });

  it("ignores a duplicate job id and a duplicate inbox event", async () => {
    const name = await newQueue();
    const id = randomUUID();
    let runs = 0;
    let resolveRun = () => {};
    const ran = new Promise<void>((resolve) => {
      resolveRun = resolve;
    });

    await queue.handle(name, async () => {
      runs += 1;
      resolveRun();
    });
    await queue.startWorker();

    expect(await queue.enqueue(name, { value: 1 }, { id })).toBe(id);
    await ran;
    expect(await queue.enqueue(name, { value: 1 }, { id })).toBeNull();
    expect(runs).toBe(1);

    const provider = `test.${randomUUID()}`;
    const eventId = randomUUID();
    expect(await inbox.record(db, { provider, eventId, eventType: "test" })).toBe(true);
    expect(await inbox.record(db, { provider, eventId, eventType: "test" })).toBe(false);
    expect((await inbox.find(provider, eventId))?.eventId).toBe(eventId);
  });

  it("reports outbox and queue metrics", async () => {
    const name = await newQueue();
    await queue.handle(name, async () => {});
    await queue.enqueue(name, { value: "queued" });

    const metrics = await queue.metrics();
    expect(metrics.enabled).toBe(true);
    expect(metrics.totals.queued).toBeGreaterThanOrEqual(1);
    expect(metrics.outbox.pending + metrics.outbox.dispatching).toBe(0);
    expect(metrics.queues.some((entry) => entry.name === name)).toBe(true);
  });

  it("registers a recurring schedule", async () => {
    const name = await newQueue();
    await queue.schedule(name, "*/5 * * * *", {}, { key: "test" });
    await queue.startWorker();

    const result = await db.execute(
      sql`select count(*)::int as total from "pgboss"."schedule" where "name" = ${name}`,
    );
    expect(Number((result.rows[0] as { total: number }).total)).toBe(1);
  });

  it("finishes an in-flight job during graceful shutdown", async () => {
    const name = await newQueue();
    let started = false;
    let release = () => {};
    let finished = false;
    const releaseJob = new Promise<void>((resolve) => {
      release = resolve;
    });

    await queue.handle(name, async () => {
      started = true;
      await releaseJob;
      finished = true;
    });
    await queue.startWorker();
    await queue.enqueue(name, { value: "slow" });

    await waitFor(() => started);
    const stopping = queue.stop();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(finished).toBe(false);

    release();
    await stopping;
    expect(finished).toBe(true);

    const result = await db.execute(
      sql`select "state" from "pgboss"."job" where "name" = ${name} order by "created_on" desc limit 1`,
    );
    expect((result.rows[0] as { state: string }).state).toBe("completed");
  });
});
