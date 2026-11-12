import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { toDateOnly } from "@hotel-booking/pricing";
import { CLOCK, type Clock } from "../../common/clock";
import { ValidationFailedException } from "../../common/errors/validation-failed.exception";
import { OffersRepository, type OfferRecord } from "../../database/repositories/offers.repository";
import type {
  AvailabilityQuery,
  BookedInventory,
  InventorySource,
  OfferDraft,
  OfferSnapshot,
  RateOption,
} from "../../domain/inventory/offer";
import { InventoryProviderRegistry } from "./inventory-provider.registry";

const MINUTE_MS = 60_000;

export type ExpectedStay = {
  hotelId: string;
  checkIn: string;
  checkOut: string;
  adultCount: number;
  childCount: number;
};

/**
 * Creates and resolves frozen offers. This is the only inventory entry point that booking,
 * cancellation and the offer endpoint use; providers stay behind the registry.
 */
@Injectable()
export class OffersService {
  constructor(
    private readonly offers: OffersRepository,
    private readonly registry: InventoryProviderRegistry,
    private readonly config: ConfigService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private get ttlMs(): number {
    return (this.config.get<number>("inventory.offerTtlMinutes") ?? 15) * MINUTE_MS;
  }

  /**
   * Asks a provider for availability and persists the selected offer. Managed is the default
   * source until supplier search exists; callers never choose a provider implementation.
   */
  async createOffer(
    query: AvailabilityQuery,
    userId: string,
    source: InventorySource = "managed",
  ): Promise<OfferSnapshot> {
    const provider = this.registry.get(source);
    const now = this.clock.now();
    const drafts = await provider.search(query);
    if (drafts.length === 0) {
      throw new NotFoundException("No availability for this stay");
    }

    const draft = await provider.quote(drafts[0], { now });
    if (draft.source === "supplier" && (!draft.supplierId || !draft.supplierOfferId)) {
      throw new ConflictException("The supplier offer is missing its provider reference");
    }
    const expiresAt = new Date(Math.min(draft.expiresAt.getTime(), now.getTime() + this.ttlMs));
    if (expiresAt.getTime() <= now.getTime()) {
      throw new ConflictException("The provider returned an offer that is already expired");
    }

    const row = await this.offers.create({
      source: draft.source,
      ...(draft.supplierId ? { supplierId: draft.supplierId } : {}),
      ...(draft.supplierOfferId ? { supplierOfferId: draft.supplierOfferId } : {}),
      hotelId: draft.hotelId,
      createdByUserId: userId,
      checkIn: parseStayDate(draft.checkIn),
      checkOut: parseStayDate(draft.checkOut),
      adultCount: draft.adultCount,
      childCount: draft.childCount,
      currencyCode: draft.price.currency,
      totalAmountMinor: draft.price.totalMinor,
      priceSnapshot: draft.price as unknown as Record<string, unknown>,
      cancellationPolicySnapshot: draft.cancellationPolicy as unknown as Record<string, unknown>,
      rateOptions: draft.rateOptions as unknown as Record<string, unknown>[],
      selectedRateOptionId: draft.selectedRateOptionId,
      ...(draft.metadata ? { metadata: draft.metadata as Record<string, unknown> } : {}),
      expiresAt,
    });

    return toOfferSnapshot(row);
  }

  /**
   * Loads an offer for booking and rejects offers that are not bookable by this guest for this
   * exact stay. A mismatch is reported on `offerId`, because the stay fields themselves passed
   * their own validation.
   */
  async findBookable(
    offerId: string,
    userId: string,
    expected: ExpectedStay,
  ): Promise<OfferSnapshot> {
    const row = await this.offers.findById(offerId);
    if (!row) throw new NotFoundException("Offer not found");

    const offer = toOfferSnapshot(row);
    if (offer.createdByUserId !== userId) {
      throw new ForbiddenException("This offer belongs to another guest");
    }
    if (offer.expiresAt.getTime() <= this.clock.now().getTime()) {
      throw new ConflictException("This offer has expired; request a fresh quote");
    }

    const mismatch =
      offer.hotelId !== expected.hotelId ||
      offer.checkIn !== toDateOnly(new Date(expected.checkIn)) ||
      offer.checkOut !== toDateOnly(new Date(expected.checkOut)) ||
      offer.adultCount !== expected.adultCount ||
      offer.childCount !== expected.childCount;
    if (mismatch) {
      throw new ValidationFailedException([
        { field: "offerId", message: "offer does not match the requested hotel and stay" },
      ]);
    }

    return offer;
  }

  /**
   * Lets the provider behind a booking release its reservation. Managed inventory has nothing to
   * cancel; a supplier adapter does. Failures propagate so booking can park in `needs_review`.
   */
  async cancelBooking(booking: BookedInventory): Promise<void> {
    if (!booking.offerId) {
      if (booking.source === "managed") return;
      throw new ConflictException("This supplier booking has no offer on record");
    }

    const row = await this.offers.findById(booking.offerId);
    if (!row) {
      throw new ConflictException("The offer behind this booking is missing");
    }

    const provider = this.registry.get(row.source);
    await provider.cancel(booking);
  }

  async cleanupExpired(now: Date = this.clock.now(), limit = 500): Promise<number> {
    return this.offers.deleteExpired(now, limit);
  }

  async listRecent(limit = 100): Promise<OfferSnapshot[]> {
    const rows = await this.offers.listRecent(limit);
    return rows.map(toOfferSnapshot);
  }
}

const parseStayDate = (value: string): Date => new Date(`${toDateOnly(value)}T00:00:00.000Z`);

/** Maps the storage row to the provider-agnostic shape used by booking and cancellation. */
export function toOfferSnapshot(row: OfferRecord): OfferSnapshot {
  return {
    id: row.id,
    source: row.source,
    ...(row.supplierId ? { supplierId: row.supplierId } : {}),
    ...(row.supplierOfferId ? { supplierOfferId: row.supplierOfferId } : {}),
    hotelId: row.hotelId,
    createdByUserId: row.createdByUserId,
    checkIn: toDateOnly(row.checkIn),
    checkOut: toDateOnly(row.checkOut),
    adultCount: row.adultCount,
    childCount: row.childCount,
    rateOptions: Array.isArray(row.rateOptions) ? (row.rateOptions as RateOption[]) : [],
    selectedRateOptionId: row.selectedRateOptionId,
    price: row.priceSnapshot as unknown as OfferDraft["price"],
    cancellationPolicy:
      row.cancellationPolicySnapshot as unknown as OfferDraft["cancellationPolicy"],
    ...(isRecord(row.metadata) ? { metadata: row.metadata } : {}),
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
