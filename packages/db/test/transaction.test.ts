import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createDb, type Database, type DatabaseHandle } from "../src/client.js";
import { POSTGRES_ERROR_CODES, type PostgresError } from "../src/errors.js";
import { users } from "../src/schema/index.js";
import { withTransaction, type TransactionRetry } from "../src/transaction.js";

const url = process.env.TEST_DATABASE_URL;

const postgresError = (code: PostgresError["code"]) =>
  Object.assign(new Error(`postgres ${code}`), { code });

describe("withTransaction retry", () => {
  it("retries serialization failures up to the attempt limit", async () => {
    const transaction = vi.fn(async () => {
      throw new Error("wrapped", {
        cause: postgresError(POSTGRES_ERROR_CODES.serializationFailure),
      });
    });
    const onRetry = vi.fn();

    await expect(
      withTransaction({ transaction } as unknown as Database, async () => "ok", {
        maxAttempts: 3,
        retryDelayMs: 0,
        onRetry,
      }),
    ).rejects.toThrow("wrapped");

    expect(transaction).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry.mock.calls[0]?.[0]).toMatchObject({
      attempt: 1,
      error: { code: POSTGRES_ERROR_CODES.serializationFailure },
    });
  });

  it("does not retry other errors", async () => {
    const transaction = vi.fn(async () => {
      throw new Error("duplicate", { cause: postgresError(POSTGRES_ERROR_CODES.uniqueViolation) });
    });

    await expect(
      withTransaction({ transaction } as unknown as Database, async () => "ok", {
        maxAttempts: 3,
        retryDelayMs: 0,
      }),
    ).rejects.toThrow("duplicate");

    expect(transaction).toHaveBeenCalledTimes(1);
  });
});

describe.skipIf(!url)("withTransaction against PostgreSQL", () => {
  let handle: DatabaseHandle;
  const emails: string[] = [];

  const email = () => {
    const value = `txn-${randomUUID()}@example.com`;
    emails.push(value);
    return value;
  };

  const insertUser = async (value = email()) => {
    const [user] = await handle.db.insert(users).values({ email: value }).returning();
    return user;
  };

  beforeAll(() => {
    handle = createDb({ connectionString: url! });
  });

  afterEach(async () => {
    for (const value of emails.splice(0)) {
      await handle.db.delete(users).where(eq(users.email, value));
    }
  });

  afterAll(async () => {
    await handle.close();
  });

  it("commits a transaction", async () => {
    const value = email();

    await withTransaction(handle.db, async (tx) => {
      await tx.insert(users).values({ email: value });
    });

    const [found] = await handle.db.select().from(users).where(eq(users.email, value));
    expect(found?.email).toBe(value);
  });

  it("rolls back a transaction when the callback throws", async () => {
    const value = email();

    await expect(
      withTransaction(handle.db, async (tx) => {
        await tx.insert(users).values({ email: value });
        throw new Error("abort");
      }),
    ).rejects.toThrow("abort");

    const found = await handle.db.select().from(users).where(eq(users.email, value));
    expect(found).toHaveLength(0);
  });

  it("retries a deadlock and eventually commits", async () => {
    const [first, second] = await Promise.all([insertUser(), insertUser()]);
    const retries: TransactionRetry[] = [];
    let locked = 0;
    let release = () => {};
    const bothLocked = new Promise<void>((resolve) => {
      release = resolve;
    });

    const updateBoth = (firstId: string, secondId: string) =>
      withTransaction(
        handle.db,
        async (tx) => {
          await tx.update(users).set({ updatedAt: new Date() }).where(eq(users.id, firstId));
          locked += 1;
          if (locked >= 2) release();
          await bothLocked;
          await tx.update(users).set({ updatedAt: new Date() }).where(eq(users.id, secondId));
        },
        { maxAttempts: 3, retryDelayMs: 0, onRetry: (retry) => retries.push(retry) },
      );

    await Promise.all([updateBoth(first.id, second.id), updateBoth(second.id, first.id)]);

    expect(
      retries.some((retry) => retry.error.code === POSTGRES_ERROR_CODES.deadlockDetected),
    ).toBe(true);
  });

  it("retries a serialization failure and eventually commits", async () => {
    const user = await insertUser();
    const retries: TransactionRetry[] = [];
    let reads = 0;
    let release = () => {};
    const bothRead = new Promise<void>((resolve) => {
      release = resolve;
    });

    const updateSameRow = () =>
      withTransaction(
        handle.db,
        async (tx) => {
          await tx.select().from(users).where(eq(users.id, user.id));
          reads += 1;
          if (reads >= 2) release();
          await bothRead;
          await tx.update(users).set({ updatedAt: new Date() }).where(eq(users.id, user.id));
        },
        {
          isolationLevel: "serializable",
          maxAttempts: 3,
          retryDelayMs: 0,
          onRetry: (retry) => retries.push(retry),
        },
      );

    await Promise.all([updateSameRow(), updateSameRow()]);

    expect(
      retries.some((retry) => retry.error.code === POSTGRES_ERROR_CODES.serializationFailure),
    ).toBe(true);
  });
});
