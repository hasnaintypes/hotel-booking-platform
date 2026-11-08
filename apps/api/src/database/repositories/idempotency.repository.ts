import { Inject, Injectable } from "@nestjs/common";
import { and, eq, isNull, lte, or } from "drizzle-orm";
import {
  idempotencyKeys,
  type Database,
  type IdempotencyKey,
  type Transaction,
} from "@hotel-booking/db";
import { DATABASE } from "../postgres.database";

type Executor = Database | Transaction;

export type NewIdempotencyRecord = {
  scope: string;
  key: string;
  requestHash: string;
  lockedUntil: Date;
  expiresAt: Date;
};

export type IdempotencyResponseEnvelope = {
  statusCode: number;
  body: unknown;
  headers?: Record<string, string>;
};

export type IdempotencyTakeover = {
  requestHash: string;
  lockedUntil: Date;
  expiresAt: Date;
};

/**
 * Persistence for the HTTP idempotency store. The unique `(scope, key)` index is the
 * serialization point: an insert either wins the key or observes the existing owner.
 */
@Injectable()
export class IdempotencyRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async tryAcquire(
    input: NewIdempotencyRecord,
    executor: Executor = this.db,
  ): Promise<IdempotencyKey | undefined> {
    const [row] = await executor
      .insert(idempotencyKeys)
      .values({
        scope: input.scope,
        key: input.key,
        requestHash: input.requestHash,
        status: "in_progress",
        lockedUntil: input.lockedUntil,
        expiresAt: input.expiresAt,
      })
      .onConflictDoNothing({ target: [idempotencyKeys.scope, idempotencyKeys.key] })
      .returning();
    return row;
  }

  async find(
    scope: string,
    key: string,
    executor: Executor = this.db,
  ): Promise<IdempotencyKey | undefined> {
    const [row] = await executor
      .select()
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key)))
      .limit(1);
    return row;
  }

  /** Takes over a lease that expired because the previous request crashed mid-flight. */
  async takeOver(
    id: string,
    input: IdempotencyTakeover,
    now: Date,
    executor: Executor = this.db,
  ): Promise<IdempotencyKey | undefined> {
    const [row] = await executor
      .update(idempotencyKeys)
      .set({
        requestHash: input.requestHash,
        status: "in_progress",
        response: null,
        lockedUntil: input.lockedUntil,
        expiresAt: input.expiresAt,
      })
      .where(
        and(
          eq(idempotencyKeys.id, id),
          eq(idempotencyKeys.status, "in_progress"),
          or(isNull(idempotencyKeys.lockedUntil), lte(idempotencyKeys.lockedUntil, now)),
        ),
      )
      .returning();
    return row;
  }

  async complete(
    id: string,
    response: IdempotencyResponseEnvelope,
    lockedUntil: Date,
    executor: Executor = this.db,
  ): Promise<void> {
    await executor
      .update(idempotencyKeys)
      .set({
        status: "completed",
        response: response as unknown as Record<string, unknown>,
        lockedUntil: null,
      })
      .where(
        and(
          eq(idempotencyKeys.id, id),
          eq(idempotencyKeys.status, "in_progress"),
          eq(idempotencyKeys.lockedUntil, lockedUntil),
        ),
      );
  }

  /** Frees a key after a handled failure so the client can retry immediately. */
  async release(id: string, lockedUntil: Date, executor: Executor = this.db): Promise<void> {
    await executor
      .delete(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.id, id),
          eq(idempotencyKeys.status, "in_progress"),
          eq(idempotencyKeys.lockedUntil, lockedUntil),
        ),
      );
  }

  async deleteById(id: string, executor: Executor = this.db): Promise<void> {
    await executor.delete(idempotencyKeys).where(eq(idempotencyKeys.id, id));
  }

  async deleteExpiredBefore(cutoff: Date, executor: Executor = this.db): Promise<number> {
    const rows = await executor
      .delete(idempotencyKeys)
      .where(lte(idempotencyKeys.expiresAt, cutoff))
      .returning({ id: idempotencyKeys.id });
    return rows.length;
  }

  async clear(): Promise<void> {
    await this.db.delete(idempotencyKeys);
  }
}
