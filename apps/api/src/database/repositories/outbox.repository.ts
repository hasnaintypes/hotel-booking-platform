import { Inject, Injectable } from "@nestjs/common";
import { and, asc, count, eq, inArray, lt, lte, sql } from "drizzle-orm";
import {
  outboxEvents,
  type Database,
  type NewOutboxEvent,
  type OutboxEvent,
  type Transaction,
} from "@hotel-booking/db";
import { DATABASE } from "../postgres.database";

export type OutboxExecutor = Database | Transaction;

export type EnqueueOutboxEventInput = {
  topic: string;
  payload?: Record<string, unknown>;
  availableAt?: Date;
};

export type OutboxMetrics = {
  pending: number;
  dispatching: number;
  failed: number;
  oldestPendingSeconds: number | null;
};

/**
 * Durable outbox storage. The business transaction inserts an event; a worker claims committed
 * rows, relays them to pg-boss and marks them dispatched. Claims use `FOR UPDATE SKIP LOCKED`, so
 * several workers can drain the table without handing the same row to two of them.
 */
@Injectable()
export class OutboxRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async enqueue(executor: OutboxExecutor, input: EnqueueOutboxEventInput): Promise<OutboxEvent> {
    const values: NewOutboxEvent = {
      topic: input.topic,
      payload: input.payload ?? {},
      ...(input.availableAt ? { availableAt: input.availableAt } : {}),
    };
    const [event] = await executor.insert(outboxEvents).values(values).returning();
    return event;
  }

  /**
   * Claims up to `limit` committed events that are due. Claimed rows stay in `dispatching` until
   * the relay succeeds, so a crash is recovered by `requeueStale` rather than losing the event.
   */
  async claim(limit: number, staleAfterMs: number): Promise<OutboxEvent[]> {
    const safeLimit = Math.max(1, Math.min(limit, 500));
    const staleBefore = new Date(Date.now() - Math.max(1_000, staleAfterMs));

    return this.db.transaction(async (tx) => {
      await tx
        .update(outboxEvents)
        .set({
          status: "pending",
          availableAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(eq(outboxEvents.status, "dispatching"), lt(outboxEvents.updatedAt, staleBefore)),
        );

      const result = await tx.execute(sql`
        update "outbox_events"
        set
          "status" = 'dispatching',
          "attempts" = "attempts" + 1,
          "updated_at" = now()
        where "id" in (
          select "id"
          from "outbox_events"
          where "status" = 'pending'
            and "available_at" <= now()
          order by "available_at" asc, "created_at" asc
          for update skip locked
          limit ${safeLimit}
        )
        returning *
      `);

      return result.rows as OutboxEvent[];
    });
  }

  async markDispatched(id: string): Promise<void> {
    await this.db
      .update(outboxEvents)
      .set({
        status: "dispatched",
        dispatchedAt: new Date(),
        updatedAt: new Date(),
        lastError: null,
      })
      .where(eq(outboxEvents.id, id));
  }

  async markPending(id: string, error: string, availableAt: Date): Promise<void> {
    await this.db
      .update(outboxEvents)
      .set({
        status: "pending",
        lastError: error.slice(0, 2_000),
        availableAt,
        updatedAt: new Date(),
      })
      .where(eq(outboxEvents.id, id));
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.db
      .update(outboxEvents)
      .set({
        status: "failed",
        lastError: error.slice(0, 2_000),
        updatedAt: new Date(),
      })
      .where(eq(outboxEvents.id, id));
  }

  async deleteDispatchedBefore(cutoff: Date): Promise<number> {
    const rows = await this.db
      .delete(outboxEvents)
      .where(and(eq(outboxEvents.status, "dispatched"), lt(outboxEvents.dispatchedAt, cutoff)))
      .returning({ id: outboxEvents.id });
    return rows.length;
  }

  async metrics(): Promise<OutboxMetrics> {
    const [rows, oldest] = await Promise.all([
      this.db
        .select({ status: outboxEvents.status, total: count() })
        .from(outboxEvents)
        .groupBy(outboxEvents.status),
      this.db
        .select({
          seconds: sql<number | null>`extract(epoch from now() - min(${outboxEvents.createdAt}))`,
        })
        .from(outboxEvents)
        .where(inArray(outboxEvents.status, ["pending", "dispatching"])),
    ]);

    const byStatus = new Map(rows.map((row) => [row.status, Number(row.total)]));
    const oldestSeconds = oldest[0]?.seconds;

    return {
      pending: byStatus.get("pending") ?? 0,
      dispatching: byStatus.get("dispatching") ?? 0,
      failed: byStatus.get("failed") ?? 0,
      oldestPendingSeconds:
        oldestSeconds === null || oldestSeconds === undefined
          ? null
          : Math.max(0, Math.round(Number(oldestSeconds))),
    };
  }

  /** Test and operational helper: removes every event so a fresh relay can be observed. */
  async clear(): Promise<void> {
    await this.db.delete(outboxEvents);
  }

  async list(status?: OutboxEvent["status"]): Promise<OutboxEvent[]> {
    const query = this.db.select().from(outboxEvents).orderBy(asc(outboxEvents.createdAt));
    return status ? query.where(eq(outboxEvents.status, status)) : query;
  }

  /** Test and operational helper: finds events due at or before `at`. */
  async listDue(at = new Date()): Promise<OutboxEvent[]> {
    return this.db
      .select()
      .from(outboxEvents)
      .where(and(eq(outboxEvents.status, "pending"), lte(outboxEvents.availableAt, at)))
      .orderBy(asc(outboxEvents.availableAt), asc(outboxEvents.createdAt));
  }
}
