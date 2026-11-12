import {
  buildCancellationPolicy,
  quoteStay,
  toDateOnly,
  type CancellationPolicy,
} from "@hotel-booking/pricing";
import type { InventoryProvider } from "../../src/domain/inventory/inventory-provider";
import type {
  AvailabilityQuery,
  BookedInventory,
  OfferDraft,
  ProviderHold,
  RateOption,
} from "../../src/domain/inventory/offer";

export type MockHotel = {
  id: string;
  status: string;
  pricePerNightMinor: number;
  currencyCode: string;
  adultCount: number;
  childCount: number;
};

export type HotelLookup = {
  findById(id: string): Promise<MockHotel | undefined>;
};

const MINUTE_MS = 60_000;
const SUPPLIER = "mock-supplier";

const calendarDate = (value: string | Date): string =>
  toDateOnly(typeof value === "string" ? new Date(value) : value);
const POLICY: CancellationPolicy = buildCancellationPolicy({
  source: "supplier",
  freeCancelHoursBeforeArrival: 24,
  penalty: { type: "percent", percent: 50 },
  rawText: "Mock supplier: free cancellation until 24 hours before arrival.",
});

/**
 * A supplier-shaped implementation used only by tests. It proves that booking and cancellation
 * code works against the same `InventoryProvider` contract as managed inventory, before a real
 * supplier adapter exists in M4.
 */
export class MockSupplierInventoryProvider implements InventoryProvider {
  readonly source = "supplier" as const;

  readonly calls = {
    search: 0,
    quote: 0,
    hold: 0,
    commit: 0,
    release: 0,
    book: 0,
    cancel: 0,
  };

  private sequence = 0;

  constructor(
    private readonly hotels: HotelLookup,
    private readonly ttlMs = 10 * MINUTE_MS,
  ) {}

  async search(query: AvailabilityQuery): Promise<OfferDraft[]> {
    this.calls.search += 1;
    const hotel = await this.hotels.findById(query.hotelId);
    if (!hotel || hotel.status !== "active") return [];

    return [this.draft(query, hotel, new Date())];
  }

  async quote(offer: OfferDraft, options: { now?: Date } = {}): Promise<OfferDraft> {
    this.calls.quote += 1;
    const now = options.now ?? new Date();
    return { ...offer, expiresAt: new Date(now.getTime() + this.ttlMs) };
  }

  async hold(_offer: OfferDraft): Promise<ProviderHold | null> {
    this.calls.hold += 1;
    return { providerReference: "mock-hold" };
  }

  async commit(_offer: OfferDraft): Promise<ProviderHold | null> {
    this.calls.commit += 1;
    return { providerReference: "mock-commit" };
  }

  async release(_offer: OfferDraft): Promise<void> {
    this.calls.release += 1;
  }

  async book(_offer: OfferDraft): Promise<ProviderHold | null> {
    this.calls.book += 1;
    return { providerReference: "mock-book" };
  }

  async cancel(_inventory: BookedInventory): Promise<void> {
    this.calls.cancel += 1;
  }

  private draft(query: AvailabilityQuery, hotel: MockHotel, now: Date): OfferDraft {
    this.sequence += 1;
    const supplierOfferId = [
      "mock",
      hotel.id.slice(0, 8),
      calendarDate(query.checkIn),
      calendarDate(query.checkOut),
      query.adultCount,
      query.childCount,
      this.sequence,
    ].join("-");

    const roomOnly = this.rateOption("mock-room-only", "room_only", query, hotel, now, 0);
    const breakfast = this.rateOption("mock-breakfast", "breakfast", query, hotel, now, 1_200);

    return {
      source: this.source,
      hotelId: hotel.id,
      supplierId: SUPPLIER,
      supplierOfferId,
      checkIn: calendarDate(query.checkIn),
      checkOut: calendarDate(query.checkOut),
      adultCount: query.adultCount,
      childCount: query.childCount,
      rateOptions: [roomOnly, breakfast],
      selectedRateOptionId: roomOnly.id,
      price: roomOnly.price,
      cancellationPolicy: roomOnly.cancellationPolicy,
      expiresAt: new Date(now.getTime() + this.ttlMs),
      metadata: { provider: SUPPLIER, boardBasis: roomOnly.boardBasis },
    };
  }

  private rateOption(
    id: string,
    boardBasis: RateOption["boardBasis"],
    query: AvailabilityQuery,
    hotel: MockHotel,
    now: Date,
    extraPerNightMinor: number,
  ): RateOption {
    return {
      id,
      boardBasis,
      occupancy: { adultCount: query.adultCount, childCount: query.childCount },
      price: quoteStay({
        currency: hotel.currencyCode,
        nightlyRateMinor: hotel.pricePerNightMinor + extraPerNightMinor,
        checkIn: calendarDate(query.checkIn),
        checkOut: calendarDate(query.checkOut),
        computedAt: now,
        rules: { "inventory.provider": SUPPLIER, "supplier.board": boardBasis },
      }),
      cancellationPolicy: POLICY,
    };
  }
}
