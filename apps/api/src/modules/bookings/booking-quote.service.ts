import { Injectable } from "@nestjs/common";
import {
  DEFAULT_MANAGED_CANCELLATION_POLICY,
  quoteStay,
  type CancellationPolicy,
  type PriceSnapshot,
} from "@hotel-booking/pricing";

export type ManagedStayQuoteInput = {
  hotel: {
    pricePerNightMinor: number;
    currencyCode: string;
  };
  checkIn: string | Date;
  checkOut: string | Date;
};

export type ManagedStayQuote = {
  price: PriceSnapshot;
  /** Frozen with the booking so later policy changes never rewrite the agreed terms. */
  cancellationPolicy: CancellationPolicy;
};

/**
 * The single place a booking price and its cancellation terms are turned into frozen snapshots.
 *
 * #52 prices managed inventory from the hotel's base rate through this seam. The unified
 * inventory/offer model (#103) will replace the body with an `Offer`/`InventoryProvider` lookup
 * (and accept a persisted `offer_id`), and #78 will supply supplier policies here, without
 * changing the controller, repository or response. Callers must treat the result as immutable.
 */
@Injectable()
export class BookingQuoteService {
  quote(input: ManagedStayQuoteInput): ManagedStayQuote {
    return {
      price: quoteStay({
        currency: input.hotel.currencyCode,
        nightlyRateMinor: input.hotel.pricePerNightMinor,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        rules: { "hotel.base-rate": "v1" },
      }),
      // Directly managed inventory uses the platform default until owners can configure their own
      // policy in #107. A supplier booking will carry the supplier's policy instead (#78).
      cancellationPolicy: DEFAULT_MANAGED_CANCELLATION_POLICY,
    };
  }
}
