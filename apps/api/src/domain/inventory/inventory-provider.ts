import type {
  AvailabilityQuery,
  BookedInventory,
  InventorySource,
  OfferDraft,
  ProviderHold,
} from "./offer.js";

/**
 * The only surface booking, pricing and cancellation may use for inventory. `apps/api/src/modules/
 * bookings` is lint-restricted to this abstraction so adding a supplier never changes booking
 * code (ADR-016).
 *
 * Managed inventory implements the reservation methods as no-ops; supplier adapters wire them to
 * the supplier-kit in M4. Methods marked optional in the supplier flow may return `null` when a
 * provider has no separate hold or when the operation is not applicable.
 */
export interface InventoryProvider {
  readonly source: InventorySource;

  /** Current bookable offers for the stay. Throws when the hotel or stay is not bookable. */
  search(query: AvailabilityQuery): Promise<OfferDraft[]>;

  /** Re-checks availability and returns the offer with a fresh expiry. */
  quote(offer: OfferDraft, options?: { now?: Date }): Promise<OfferDraft>;

  /** Places a supplier reservation before payment. */
  hold(offer: OfferDraft): Promise<ProviderHold | null>;

  /** Confirms a held reservation after payment succeeds. */
  commit(offer: OfferDraft): Promise<ProviderHold | null>;

  /** Releases a hold that will not be booked or paid for. */
  release(offer: OfferDraft): Promise<void>;

  /** Books directly when a provider has no separate hold step. */
  book(offer: OfferDraft): Promise<ProviderHold | null>;

  /** Cancels the reservation behind a booking. Idempotent for a already-cancelled booking. */
  cancel(inventory: BookedInventory): Promise<void>;
}
