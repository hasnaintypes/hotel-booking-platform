import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DEFAULT_MANAGED_CANCELLATION_POLICY,
  PriceSnapshotError,
  quoteStay,
  toDateOnly,
  type PriceSnapshot,
} from "@hotel-booking/pricing";
import { CLOCK, type Clock } from "../../../common/clock";
import { ValidationFailedException } from "../../../common/errors/validation-failed.exception";
import { HotelsRepository } from "../../../database/repositories/hotels.repository";
import { validateStay } from "../../../domain/bookings/stay-validation";
import type { InventoryProvider } from "../../../domain/inventory/inventory-provider";
import type {
  AvailabilityQuery,
  BookedInventory,
  OfferDraft,
  ProviderHold,
  RateOption,
} from "../../../domain/inventory/offer";

const RATE_OPTION_ID = "managed-standard";
const MINUTE_MS = 60_000;

/** Booking DTOs carry ISO instants; provider quotes use UTC calendar dates. */
const calendarDate = (value: string | Date): string =>
  toDateOnly(typeof value === "string" ? new Date(value) : value);

/**
 * Placeholder provider for owner-listed inventory. Until M8 introduces room types and real
 * availability, every active hotel sells one room-only rate at its base nightly price.
 *
 * This class is the only place that knows how managed availability is computed. Booking code
 * receives an `OfferDraft` and never imports this file (lint-enforced).
 */
@Injectable()
export class ManagedInventoryProvider implements InventoryProvider {
  readonly source = "managed" as const;

  constructor(
    private readonly hotels: HotelsRepository,
    private readonly config: ConfigService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private get ttlMs(): number {
    return (this.config.get<number>("inventory.offerTtlMinutes") ?? 15) * MINUTE_MS;
  }

  private get maxNights(): number {
    return this.config.get<number>("booking.maxNights") ?? 30;
  }

  async search(query: AvailabilityQuery): Promise<OfferDraft[]> {
    const hotel = await this.hotels.findById(query.hotelId);
    if (!hotel) throw new NotFoundException("Hotel not found");
    if (hotel.status !== "active") {
      throw new ConflictException("This hotel is not available for booking");
    }

    const now = this.clock.now();
    const errors = validateStay(
      query,
      { adultCount: hotel.adultCount, childCount: hotel.childCount, maxNights: this.maxNights },
      now,
    );
    if (errors.length > 0) throw new ValidationFailedException(errors);

    const option = this.rateOption(hotel.currencyCode, hotel.pricePerNightMinor, query, now);

    return [
      {
        source: this.source,
        hotelId: hotel.id,
        checkIn: calendarDate(query.checkIn),
        checkOut: calendarDate(query.checkOut),
        adultCount: query.adultCount,
        childCount: query.childCount,
        rateOptions: [option],
        selectedRateOptionId: option.id,
        price: option.price,
        cancellationPolicy: option.cancellationPolicy,
        expiresAt: new Date(now.getTime() + this.ttlMs),
        metadata: { provider: "managed", rule: "hotel.base-rate@v1" },
      },
    ];
  }

  async quote(offer: OfferDraft, options: { now?: Date } = {}): Promise<OfferDraft> {
    const hotel = await this.hotels.findById(offer.hotelId);
    if (!hotel) throw new NotFoundException("Hotel not found");
    if (hotel.status !== "active") {
      throw new ConflictException("This hotel is not available for booking");
    }

    const now = options.now ?? this.clock.now();
    const query: AvailabilityQuery = {
      hotelId: offer.hotelId,
      checkIn: offer.checkIn,
      checkOut: offer.checkOut,
      adultCount: offer.adultCount,
      childCount: offer.childCount,
    };
    const errors = validateStay(
      query,
      { adultCount: hotel.adultCount, childCount: hotel.childCount, maxNights: this.maxNights },
      now,
    );
    if (errors.length > 0) throw new ValidationFailedException(errors);

    const option = this.rateOption(hotel.currencyCode, hotel.pricePerNightMinor, query, now);
    return {
      ...offer,
      rateOptions: [option],
      selectedRateOptionId: option.id,
      price: option.price,
      cancellationPolicy: option.cancellationPolicy,
      expiresAt: new Date(now.getTime() + this.ttlMs),
    };
  }

  async hold(_offer: OfferDraft): Promise<ProviderHold | null> {
    return null;
  }

  async commit(_offer: OfferDraft): Promise<ProviderHold | null> {
    return null;
  }

  async release(_offer: OfferDraft): Promise<void> {}

  async book(_offer: OfferDraft): Promise<ProviderHold | null> {
    return null;
  }

  /** Directly managed inventory has no external reservation to cancel. */
  async cancel(_inventory: BookedInventory): Promise<void> {}

  private rateOption(
    currency: string,
    nightlyRateMinor: number,
    query: AvailabilityQuery,
    now: Date,
  ): RateOption {
    let price: PriceSnapshot;
    try {
      price = quoteStay({
        currency,
        nightlyRateMinor,
        checkIn: calendarDate(query.checkIn),
        checkOut: calendarDate(query.checkOut),
        computedAt: now,
        rules: { "hotel.base-rate": "v1", "inventory.provider": "managed" },
      });
    } catch (error) {
      if (error instanceof PriceSnapshotError) {
        throw new ValidationFailedException([{ field: "checkOut", message: error.message }]);
      }
      throw error;
    }

    return {
      id: RATE_OPTION_ID,
      boardBasis: "room_only",
      occupancy: { adultCount: query.adultCount, childCount: query.childCount },
      price,
      cancellationPolicy: DEFAULT_MANAGED_CANCELLATION_POLICY,
    };
  }
}
