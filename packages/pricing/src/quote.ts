import { assertAmountMinor, normalizeCurrency, type RoundingMode } from "./money.js";
import {
  addDays,
  buildPriceSnapshot,
  countNights,
  toDateOnly,
  type PriceSnapshot,
  type PriceSnapshotFxInput,
} from "./snapshot.js";

export type StayQuoteInput = {
  currency: string;
  nightlyRateMinor: number;
  checkIn: string | Date;
  checkOut: string | Date;
  taxesMinor?: number;
  feesMinor?: number;
  computedAt?: Date | string;
  rounding?: RoundingMode;
  rules?: Readonly<Record<string, string>>;
  fx?: PriceSnapshotFxInput;
};

/**
 * Server-side quote for directly managed inventory. Dates are calendar dates in UTC, so the
 * number of nights does not depend on the server's time zone or daylight-saving transitions.
 */
export function quoteStay(input: StayQuoteInput): PriceSnapshot {
  const checkIn = toDateOnly(input.checkIn);
  const checkOut = toDateOnly(input.checkOut);
  const nights = countNights(checkIn, checkOut);
  normalizeCurrency(input.currency);
  assertAmountMinor(input.nightlyRateMinor);

  const nightlyRates = Array.from({ length: nights }, (_, index) => ({
    date: addDays(checkIn, index),
    amountMinor: input.nightlyRateMinor,
  }));

  return buildPriceSnapshot({
    currency: input.currency,
    nightlyRates,
    ...(input.taxesMinor === undefined ? {} : { taxesMinor: input.taxesMinor }),
    ...(input.feesMinor === undefined ? {} : { feesMinor: input.feesMinor }),
    computedAt: input.computedAt ?? new Date(),
    ...(input.rounding === undefined ? {} : { rounding: input.rounding }),
    ...(input.rules === undefined ? {} : { rules: input.rules }),
    ...(input.fx === undefined ? {} : { fx: input.fx }),
  });
}
