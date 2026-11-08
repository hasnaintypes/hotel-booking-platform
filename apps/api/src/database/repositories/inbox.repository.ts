import { Inject, Injectable } from "@nestjs/common";
import { and, eq, isNotNull, lt } from "drizzle-orm";
import { inboxEvents, type Database, type InboxEvent, type Transaction } from "@hotel-booking/db";
import { DATABASE } from "../postgres.database";

export type InboxExecutor = Database | Transaction;

export type RecordInboxEventInput = {
  provider: string;
  eventId: string;
  eventType?: string;
  payload?: Record<string, unknown>;
};

/**
 * Inbound event dedupe. `record` returns false when the same provider event was already stored,
 * which lets a webhook handler acknowledge a replay without repeating side effects.
 */
@Injectable()
export class InboxRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async record(executor: InboxExecutor, input: RecordInboxEventInput): Promise<boolean> {
    const [row] = await executor
      .insert(inboxEvents)
      .values({
        provider: input.provider,
        eventId: input.eventId,
        eventType: input.eventType ?? null,
        payload: input.payload ?? {},
      })
      .onConflictDoNothing({
        target: [inboxEvents.provider, inboxEvents.eventId],
      })
      .returning({ id: inboxEvents.id });
    return Boolean(row);
  }

  async markProcessed(id: string): Promise<void> {
    await this.db
      .update(inboxEvents)
      .set({ processedAt: new Date() })
      .where(eq(inboxEvents.id, id));
  }

  async find(provider: string, eventId: string): Promise<InboxEvent | undefined> {
    const [row] = await this.db
      .select()
      .from(inboxEvents)
      .where(and(eq(inboxEvents.provider, provider), eq(inboxEvents.eventId, eventId)))
      .limit(1);
    return row;
  }

  async deleteProcessedBefore(cutoff: Date): Promise<number> {
    const rows = await this.db
      .delete(inboxEvents)
      .where(and(isNotNull(inboxEvents.processedAt), lt(inboxEvents.processedAt, cutoff)))
      .returning({ id: inboxEvents.id });
    return rows.length;
  }

  async clear(): Promise<void> {
    await this.db.delete(inboxEvents);
  }
}
