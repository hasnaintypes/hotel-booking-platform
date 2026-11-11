import { Inject, Injectable } from "@nestjs/common";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  bookings,
  inboxEvents,
  ledgerEntries,
  payments,
  withTransaction,
  type Booking,
  type Database,
  type LedgerEntry,
  type LedgerEntryType,
  type Payment,
  type PaymentStatus,
  type Transaction,
} from "@hotel-booking/db";
import { isUuid } from "../../common/utils/uuid";
import {
  BookingTransitionConflictError,
  type BookingTransitionInput,
} from "../../domain/bookings/booking-state-machine";
import { DATABASE } from "../postgres.database";
import { BookingsRepository } from "./bookings.repository";

export type WebhookInboxInput = {
  provider: string;
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
};

export type PaymentStateChange = {
  status: PaymentStatus;
  /** The update only applies while the row is in one of these states, so an older event can
   * never move a payment backwards. */
  fromStatuses: PaymentStatus[];
  providerPaymentId?: string;
  capturedAmountMinor?: number | null;
  failureCode?: string | null;
  failureMessage?: string | null;
};

export type WebhookLedgerInput = {
  bookingId: string;
  paymentId?: string;
  entryType: LedgerEntryType;
  sourceKey: string;
  amountMinor: number;
  currencyCode: string;
  description?: string;
};

/**
 * Transaction-scoped operations a webhook handler may use. The facade exists so the handler can
 * apply every write inside the inbox transaction without importing the database package.
 */
export type WebhookTransaction = {
  findBooking(bookingId: string): Promise<Booking | undefined>;
  findPaymentByProviderId(providerPaymentId: string): Promise<Payment | undefined>;
  findPaymentByIdempotencyKey(idempotencyKey: string): Promise<Payment | undefined>;
  updatePaymentState(paymentId: string, change: PaymentStateChange): Promise<Payment | undefined>;
  recordLedgerEntry(input: WebhookLedgerInput): Promise<LedgerEntry | undefined>;
  refundedMinor(bookingId: string): Promise<number>;
  /** Returns false when another writer already moved the booking, instead of throwing. */
  transitionBooking(input: BookingTransitionInput): Promise<boolean>;
};

export type WebhookOutcome = "processed" | "duplicate";

/**
 * Durable inbox for provider webhooks. The inbox row, the business writes and the processed mark
 * share one transaction: a failure rolls all three back so the provider's retry is applied from
 * scratch, while a duplicate delivery finds the committed row and is acknowledged without work.
 */
@Injectable()
export class StripeWebhookRepository {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly bookings: BookingsRepository,
  ) {}

  async processOnce(
    input: WebhookInboxInput,
    apply: (tx: WebhookTransaction) => Promise<void>,
  ): Promise<WebhookOutcome> {
    return withTransaction(this.db, async (tx) => {
      const [recorded] = await tx
        .insert(inboxEvents)
        .values({
          provider: input.provider,
          eventId: input.eventId,
          eventType: input.eventType,
          payload: input.payload,
        })
        .onConflictDoNothing({
          target: [inboxEvents.provider, inboxEvents.eventId],
        })
        .returning({ id: inboxEvents.id });

      if (!recorded) return "duplicate";

      await apply(this.transaction(tx));

      await tx
        .update(inboxEvents)
        .set({ processedAt: new Date() })
        .where(eq(inboxEvents.id, recorded.id));

      return "processed";
    });
  }

  private transaction(tx: Transaction): WebhookTransaction {
    return {
      findBooking: async (bookingId) => {
        if (!isUuid(bookingId)) return undefined;
        const [row] = await tx.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
        return row;
      },

      findPaymentByProviderId: async (providerPaymentId) => {
        const [row] = await tx
          .select()
          .from(payments)
          .where(
            and(eq(payments.provider, "stripe"), eq(payments.providerPaymentId, providerPaymentId)),
          )
          .limit(1);
        return row;
      },

      findPaymentByIdempotencyKey: async (idempotencyKey) => {
        const [row] = await tx
          .select()
          .from(payments)
          .where(eq(payments.idempotencyKey, idempotencyKey))
          .limit(1);
        return row;
      },

      updatePaymentState: async (paymentId, change) => {
        if (!isUuid(paymentId) || change.fromStatuses.length === 0) return undefined;
        const [row] = await tx
          .update(payments)
          .set({
            status: change.status,
            ...(change.providerPaymentId ? { providerPaymentId: change.providerPaymentId } : {}),
            ...(change.capturedAmountMinor !== undefined
              ? { capturedAmountMinor: change.capturedAmountMinor }
              : {}),
            ...(change.failureCode !== undefined ? { failureCode: change.failureCode } : {}),
            ...(change.failureMessage !== undefined
              ? { failureMessage: change.failureMessage }
              : {}),
            updatedAt: new Date(),
          })
          .where(and(eq(payments.id, paymentId), inArray(payments.status, change.fromStatuses)))
          .returning();
        return row;
      },

      recordLedgerEntry: async (input) => {
        const [row] = await tx
          .insert(ledgerEntries)
          .values({
            bookingId: input.bookingId,
            paymentId: input.paymentId ?? null,
            entryType: input.entryType,
            sourceKey: input.sourceKey,
            amountMinor: input.amountMinor,
            currencyCode: input.currencyCode,
            description: input.description ?? null,
          })
          .onConflictDoNothing()
          .returning();
        return row;
      },

      refundedMinor: async (bookingId) => {
        if (!isUuid(bookingId)) return 0;
        const [row] = await tx
          .select({
            total: sql<number>`coalesce(sum(${ledgerEntries.amountMinor}) filter (where ${ledgerEntries.entryType} = 'refund'), 0)::int`,
          })
          .from(ledgerEntries)
          .where(eq(ledgerEntries.bookingId, bookingId));
        return Number(row?.total ?? 0);
      },

      transitionBooking: async (input) => {
        try {
          await this.bookings.transitionOn(tx, input);
          return true;
        } catch (error) {
          if (error instanceof BookingTransitionConflictError) return false;
          throw error;
        }
      },
    };
  }
}
