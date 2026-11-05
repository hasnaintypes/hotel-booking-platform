import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DatabaseHandle } from "../src/client.js";
import { withDatabaseTimeouts } from "../src/timeouts.js";

const url = process.env.TEST_DATABASE_URL;

type Settings = {
  statement_timeout: string;
  idle_in_transaction_session_timeout: string;
  lock_timeout: string;
};

const readSettings = async (query: (statement: ReturnType<typeof sql>) => Promise<unknown>) =>
  (await query(
    sql`select current_setting('statement_timeout') as statement_timeout,
               current_setting('idle_in_transaction_session_timeout') as idle_in_transaction_session_timeout,
               current_setting('lock_timeout') as lock_timeout`,
  )) as { rows: Settings[] };

describe.skipIf(!url)("database timeouts on PostgreSQL", () => {
  let handle: DatabaseHandle;

  beforeAll(() => {
    handle = createDb({
      connectionString: url!,
      maxConnections: 2,
      statementTimeoutMs: 1_234,
      idleInTransactionTimeoutMs: 3_456,
      lockTimeoutMs: 2_345,
    });
  });

  afterAll(async () => {
    await handle.close();
  });

  it("configures the pool defaults at connection time", async () => {
    const result = await handle.pool.query<Settings>(
      `select current_setting('statement_timeout') as statement_timeout,
              current_setting('idle_in_transaction_session_timeout') as idle_in_transaction_session_timeout,
              current_setting('lock_timeout') as lock_timeout`,
    );

    expect(result.rows[0]).toEqual({
      statement_timeout: "1234ms",
      idle_in_transaction_session_timeout: "3456ms",
      lock_timeout: "2345ms",
    });
  });

  it("applies per-request overrides only inside the transaction", async () => {
    await withDatabaseTimeouts(
      handle.db,
      { statementTimeoutMs: 4_321, idleInTransactionTimeoutMs: 6_543, lockTimeoutMs: 7_654 },
      async (tx) => {
        const result = await readSettings((statement) => tx.execute(statement));
        expect(result.rows[0]).toEqual({
          statement_timeout: "4321ms",
          idle_in_transaction_session_timeout: "6543ms",
          lock_timeout: "7654ms",
        });
      },
    );

    const after = await handle.pool.query<Settings>(
      `select current_setting('statement_timeout') as statement_timeout,
              current_setting('idle_in_transaction_session_timeout') as idle_in_transaction_session_timeout,
              current_setting('lock_timeout') as lock_timeout`,
    );
    expect(after.rows[0]).toEqual({
      statement_timeout: "1234ms",
      idle_in_transaction_session_timeout: "3456ms",
      lock_timeout: "2345ms",
    });
  });

  it("aborts a statement that exceeds the statement timeout", async () => {
    await expect(
      withDatabaseTimeouts(handle.db, { statementTimeoutMs: 100 }, async (tx) => {
        await tx.execute(sql`select pg_sleep(0.5)`);
      }),
    ).rejects.toMatchObject({ cause: { code: "57014" } });
  });

  it("aborts a long-running lock wait at the configured lock timeout", async () => {
    const blocker = await handle.pool.connect();
    const lockId = 7_654_321;

    try {
      await blocker.query("select pg_advisory_lock($1)", [lockId]);

      await expect(
        withDatabaseTimeouts(handle.db, { lockTimeoutMs: 100 }, async (tx) => {
          await tx.execute(sql`select pg_advisory_xact_lock(${lockId})`);
        }),
      ).rejects.toMatchObject({ cause: { code: "55P03" } });
    } finally {
      await blocker.query("select pg_advisory_unlock($1)", [lockId]);
      blocker.release();
    }
  });
});
