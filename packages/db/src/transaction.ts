import type { Database } from "./client.js";
import { findPostgresError, isRetryableTransactionError, type PostgresError } from "./errors.js";

export type TransactionIsolationLevel =
  "read uncommitted" | "read committed" | "repeatable read" | "serializable";

export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type TransactionRetry = {
  error: PostgresError;
  attempt: number;
  delayMs: number;
};

export type TransactionOptions = {
  isolationLevel?: TransactionIsolationLevel;
  maxAttempts?: number;
  retryDelayMs?: number;
  onRetry?: (retry: TransactionRetry) => void;
};

const MAX_RETRY_DELAY_MS = 1_000;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function withTransaction<T>(
  db: Database,
  run: (tx: Transaction) => Promise<T>,
  options: TransactionOptions = {},
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const baseDelayMs = Math.max(0, options.retryDelayMs ?? 25);

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await db.transaction(
        run,
        options.isolationLevel ? { isolationLevel: options.isolationLevel } : {},
      );
    } catch (error) {
      if (attempt >= maxAttempts || !isRetryableTransactionError(error)) throw error;

      const postgresError = findPostgresError(error);
      if (!postgresError) throw error;

      const delayMs = Math.min(baseDelayMs * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS);
      options.onRetry?.({ error: postgresError, attempt, delayMs });
      await delay(delayMs);
    }
  }
}
