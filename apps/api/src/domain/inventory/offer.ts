import type { CancellationPolicy, PriceSnapshot } from "@hotel-booking/pricing";

/** Where an offer's inventory comes from. Mirrors the database `inventory_source` enum. */
export type InventorySource = "managed" | "supplier";

/** Board basis as normalised from the provider; suppliers keep their own wording in metadata. */
export type BoardBasis = "room_only" | "breakfast" | "half_board" | "full_board" | "all_inclusive";

export type Occupancy = {
  readonly adultCount: number;
  readonly childCount: number;
};

/**
 * One bookable combination of board basis and occupancy. A supplier search can return several;
 * the selected one is copied to the top-level offer fields so booking code never has to choose.
 */
export type RateOption = {
  readonly id: string;
  readonly boardBasis: BoardBasis;
  readonly occupancy: Occupancy;
  readonly price: PriceSnapshot;
  readonly cancellationPolicy: CancellationPolicy;
};

/** What a guest asks for before a provider returns concrete offers. */
export type AvailabilityQuery = {
  readonly hotelId: string;
  readonly checkIn: string;
  readonly checkOut: string;
  readonly adultCount: number;
  readonly childCount: number;
};

/**
 * A provider's frozen quote. It is deliberately provider-agnostic: booking, pricing and
 * cancellation only ever see this shape, never a managed or supplier implementation.
 */
export type OfferDraft = {
  readonly source: InventorySource;
  readonly hotelId: string;
  readonly supplierId?: string;
  readonly supplierOfferId?: string;
  readonly checkIn: string;
  readonly checkOut: string;
  readonly adultCount: number;
  readonly childCount: number;
  readonly rateOptions: readonly RateOption[];
  readonly selectedRateOptionId: string;
  /** The selected rate option's price, duplicated for a cheap and explicit booking path. */
  readonly price: PriceSnapshot;
  /** The selected rate option's cancellation terms, frozen with the booking. */
  readonly cancellationPolicy: CancellationPolicy;
  /** The instant after which the quote must not be booked. */
  readonly expiresAt: Date;
  readonly metadata?: Readonly<Record<string, unknown>>;
};

/** A persisted offer, as loaded by the offer service. */
export type OfferSnapshot = OfferDraft & {
  readonly id: string;
  readonly createdByUserId: string;
  readonly createdAt: Date;
};

/** A supplier reservation reference returned by hold/commit/book. Managed inventory has none. */
export type ProviderHold = {
  readonly providerReference: string;
  readonly expiresAt?: Date;
};

/** The minimum booking state a provider needs to cancel the reservation behind it. */
export type BookedInventory = {
  readonly bookingId: string;
  readonly offerId: string | null;
  readonly source: InventorySource;
  readonly supplierId: string | null;
  readonly supplierReference: string | null;
};

export const selectedRateOption = (
  offer: Pick<OfferDraft, "rateOptions" | "selectedRateOptionId">,
) =>
  offer.rateOptions.find((option) => option.id === offer.selectedRateOptionId) ??
  offer.rateOptions[0];
