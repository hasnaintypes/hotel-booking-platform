import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, inArray, lt, notExists, sql } from "drizzle-orm";
import { bookings, offers, type Database, type Offer } from "@hotel-booking/db";
import { throwPostgresError } from "../../common/errors/postgres-errors";
import { isUuid } from "../../common/utils/uuid";
import { DATABASE } from "../postgres.database";

/** The storage row shape, re-exported so module code never imports the database package. */
export type OfferRecord = Offer;

export type NewOfferInput = {
  source: "managed" | "supplier";
  supplierId?: string;
  supplierOfferId?: string;
  hotelId: string;
  createdByUserId: string;
  checkIn: Date;
  checkOut: Date;
  adultCount: number;
  childCount: number;
  currencyCode: string;
  totalAmountMinor: number;
  priceSnapshot: Record<string, unknown>;
  cancellationPolicySnapshot: Record<string, unknown>;
  rateOptions: Record<string, unknown>[];
  selectedRateOptionId: string;
  metadata?: Record<string, unknown>;
  expiresAt: Date;
};

/** Storage for frozen offers. Booking and cancellation only read; the inventory module writes. */
@Injectable()
export class OffersRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async create(input: NewOfferInput): Promise<Offer> {
    try {
      const [row] = await this.db
        .insert(offers)
        .values({
          source: input.source,
          supplierId: input.supplierId ?? null,
          supplierOfferId: input.supplierOfferId ?? null,
          hotelId: input.hotelId,
          createdByUserId: input.createdByUserId,
          checkIn: input.checkIn,
          checkOut: input.checkOut,
          adultCount: input.adultCount,
          childCount: input.childCount,
          currencyCode: input.currencyCode,
          totalAmountMinor: input.totalAmountMinor,
          priceSnapshot: input.priceSnapshot,
          cancellationPolicySnapshot: input.cancellationPolicySnapshot,
          rateOptions: input.rateOptions,
          selectedRateOptionId: input.selectedRateOptionId,
          metadata: input.metadata ?? {},
          expiresAt: input.expiresAt,
        })
        .returning();
      return row;
    } catch (error) {
      return throwPostgresError(error);
    }
  }

  async findById(id: string): Promise<Offer | undefined> {
    if (!isUuid(id)) return undefined;
    const [row] = await this.db.select().from(offers).where(eq(offers.id, id)).limit(1);
    return row;
  }

  /** Removes offers that can no longer be booked and were never attached to a booking. */
  async deleteExpired(now: Date, limit = 500): Promise<number> {
    const bounded = Math.min(Math.max(limit, 1), 2_000);
    const referencedByBooking = this.db
      .select({ id: bookings.id })
      .from(bookings)
      .where(eq(bookings.offerId, offers.id));
    const expired = await this.db
      .select({ id: offers.id })
      .from(offers)
      .where(and(lt(offers.expiresAt, now), notExists(referencedByBooking)))
      .limit(bounded);
    if (expired.length === 0) return 0;

    const rows = await this.db
      .delete(offers)
      .where(
        inArray(
          offers.id,
          expired.map((row) => row.id),
        ),
      )
      .returning({ id: offers.id });
    return rows.length;
  }

  /** Bounded admin/debug view used by tests and later triage screens. */
  async listRecent(limit = 100): Promise<Offer[]> {
    return this.db
      .select()
      .from(offers)
      .orderBy(asc(offers.createdAt))
      .limit(Math.min(Math.max(limit, 1), 500));
  }

  async count(): Promise<number> {
    const [row] = await this.db.select({ count: sql<number>`count(*)::int` }).from(offers);
    return Number(row?.count ?? 0);
  }
}
