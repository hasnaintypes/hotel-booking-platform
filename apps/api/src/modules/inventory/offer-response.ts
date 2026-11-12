import type { OfferSnapshot, RateOption } from "../../domain/inventory/offer";

export type OfferRateOptionResponse = {
  id: string;
  boardBasis: RateOption["boardBasis"];
  totalMinor: number;
  totalCost: number;
  currency: string;
};

export type OfferResponse = {
  id: string;
  source: OfferSnapshot["source"];
  hotelId: string;
  checkIn: string;
  checkOut: string;
  adultCount: number;
  childCount: number;
  totalMinor: number;
  totalCost: number;
  currency: string;
  cancellationPolicy: OfferSnapshot["cancellationPolicy"];
  rateOptions: OfferRateOptionResponse[];
  expiresAt: Date;
};

/** The public shape of a frozen offer; booking only needs `id` plus the displayed totals. */
export function toOfferResponse(offer: OfferSnapshot): OfferResponse {
  return {
    id: offer.id,
    source: offer.source,
    hotelId: offer.hotelId,
    checkIn: offer.checkIn,
    checkOut: offer.checkOut,
    adultCount: offer.adultCount,
    childCount: offer.childCount,
    totalMinor: offer.price.totalMinor,
    totalCost: offer.price.totalMinor / 100,
    currency: offer.price.currency,
    cancellationPolicy: offer.cancellationPolicy,
    rateOptions: offer.rateOptions.map((option) => ({
      id: option.id,
      boardBasis: option.boardBasis,
      totalMinor: option.price.totalMinor,
      totalCost: option.price.totalMinor / 100,
      currency: option.price.currency,
    })),
    expiresAt: offer.expiresAt,
  };
}
