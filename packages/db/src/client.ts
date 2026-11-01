import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { schema } from "./schema/index.js";

export type Database = NodePgDatabase<typeof schema>;

export type CreateDatabaseOptions = {
  connectionString: string;
  maxConnections?: number;
  statementTimeoutMs?: number;
  idleInTransactionTimeoutMs?: number;
};

export type DatabaseHandle = {
  db: Database;
  pool: Pool;
  close: () => Promise<void>;
};

export function createDb({
  connectionString,
  maxConnections = 10,
  statementTimeoutMs = 5_000,
  idleInTransactionTimeoutMs = 10_000,
}: CreateDatabaseOptions): DatabaseHandle {
  const pool = new Pool({
    connectionString,
    max: maxConnections,
    statement_timeout: statementTimeoutMs,
    idle_in_transaction_session_timeout: idleInTransactionTimeoutMs,
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
