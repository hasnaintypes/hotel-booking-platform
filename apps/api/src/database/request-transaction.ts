import { AsyncLocalStorage } from "node:async_hooks";
import { withTransaction, type Database, type Transaction } from "@hotel-booking/db";

const storage = new AsyncLocalStorage<Transaction>();

export const currentRequestTransaction = (): Transaction | undefined => storage.getStore();

export const runInRequestTransaction = <T>(tx: Transaction, run: () => Promise<T>): Promise<T> =>
  storage.run(tx, run);

/**
 * Joins the transaction opened by the idempotency interceptor when one exists; otherwise opens its
 * own. Repositories use this so the idempotency completion and the business write commit together.
 */
export async function withRequestTransaction<T>(
  db: Database,
  run: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const existing = storage.getStore();
  if (existing) return run(existing);
  return withTransaction(db, (tx) => storage.run(tx, () => run(tx)));
}
