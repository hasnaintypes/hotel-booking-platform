import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { schema } from "./schema/index.js";

export type Database = NodePgDatabase<typeof schema>;

/** Defaults chosen for short API requests, not long-running batch jobs. */
export const DEFAULT_DATABASE_TIMEOUTS = {
  maxConnections: 10,
  statementTimeoutMs: 5_000,
  idleInTransactionTimeoutMs: 10_000,
  lockTimeoutMs: 3_000,
} as const;

export type CreateDatabaseOptions = {
  connectionString: string;
  maxConnections?: number;
  statementTimeoutMs?: number;
  idleInTransactionTimeoutMs?: number;
  lockTimeoutMs?: number;
};

export type DatabaseHandle = {
  db: Database;
  pool: Pool;
  close: () => Promise<void>;
};

export function createDb({
  connectionString,
  maxConnections = DEFAULT_DATABASE_TIMEOUTS.maxConnections,
  statementTimeoutMs = DEFAULT_DATABASE_TIMEOUTS.statementTimeoutMs,
  idleInTransactionTimeoutMs = DEFAULT_DATABASE_TIMEOUTS.idleInTransactionTimeoutMs,
  lockTimeoutMs = DEFAULT_DATABASE_TIMEOUTS.lockTimeoutMs,
}: CreateDatabaseOptions): DatabaseHandle {
  const pool = new Pool({
    connectionString,
    max: maxConnections,
    statement_timeout: statementTimeoutMs,
    idle_in_transaction_session_timeout: idleInTransactionTimeoutMs,
    lock_timeout: lockTimeoutMs,
  });
  const db = drizzle(pool, { schema });

  return {
    db,
    pool,
    close: async () => {
      await pool.end();
    },
  };
}
