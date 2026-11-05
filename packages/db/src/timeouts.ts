import { sql } from "drizzle-orm";
import type { Database } from "./client.js";
import type { Transaction } from "./transaction.js";

/** Per-request timeout overrides, applied for the duration of one transaction. */
export type DatabaseTimeoutOverrides = {
  statementTimeoutMs?: number;
  idleInTransactionTimeoutMs?: number;
  lockTimeoutMs?: number;
};

const validateTimeout = (name: string, value: number) => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive whole number of milliseconds`);
  }
};

/**
 * Applies timeout overrides with `set_config(..., true)`, so they are scoped to the current
 * transaction and never leak back into the pooled connection.
 */
export async function applyLocalDatabaseTimeouts(
  tx: Transaction,
  overrides: DatabaseTimeoutOverrides,
): Promise<void> {
  const settings: Array<[string, number | undefined]> = [
    ["statement_timeout", overrides.statementTimeoutMs],
    ["idle_in_transaction_session_timeout", overrides.idleInTransactionTimeoutMs],
    ["lock_timeout", overrides.lockTimeoutMs],
  ];

  for (const [name, value] of settings) {
    if (value === undefined) continue;
    validateTimeout(name, value);
    await tx.execute(sql`select set_config(${name}, ${`${value}ms`}, true)`);
  }
}

/**
 * Runs a unit of work with request-specific database timeouts. Use this for endpoints that need
 * more or less time than the client defaults; the override ends with the transaction.
 */
export async function withDatabaseTimeouts<T>(
  db: Database,
  overrides: DatabaseTimeoutOverrides,
  run: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await applyLocalDatabaseTimeouts(tx, overrides);
    return run(tx);
  });
}
