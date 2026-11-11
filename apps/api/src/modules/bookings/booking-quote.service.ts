import { Injectable } from "@nestjs/common";
import { quoteStay, type PriceSnapshot } from "@hotel-booking/pricing";

export type ManagedStayQuoteInput = {
  hotel: {
    pricePerNightMinor: number;
    currencyCode: string;
  };
  checkIn: string | Date;
  checkOut: string | Date;
};

/**
 * The single place a booking price is turned into a frozen snapshot.
 *
 * #52 prices managed inventory from the hotel's base rate through this seam. The unified
 * inventory/offer model (#103) will replace the body with an `Offer`/`InventoryProvider` lookup
 * (and accept a persisted `offer_id`) without changing the controller, repository or response.
 * Callers must treat the returned snapshot as immutable.
 */
@Injectable()
export class BookingQuoteService {
  quote(input: ManagedStayQuoteInput): PriceSnapshot {
    return quoteStay({
      currency: input.hotel.currencyCode,
      nightlyRateMinor: input.hotel.pricePerNightMinor,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      rules: { "hotel.base-rate": "v1" },
    });
  }
}
