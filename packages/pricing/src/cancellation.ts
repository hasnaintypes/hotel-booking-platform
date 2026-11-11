import { assertAmountMinor, normalizeCurrency, type CurrencyCode } from "./money.js";
import { countNights, parseDateOnly, toDateOnly, type PriceSnapshotNight } from "./snapshot.js";

export const CANCELLATION_POLICY_VERSION = 1 as const;

export type CancellationPolicySource = "managed" | "supplier";

/**
 * What the guest forfeits once the free-cancellation window has closed.
 * - `percent`: a share of the booking total.
 * - `nights`: the first N nights of the stay (accommodation only).
 * - `full`: nothing is refundable.
 */
export type CancellationPenalty =
  | { readonly type: "percent"; readonly percent: number }
  | { readonly type: "nights"; readonly nights: number }
  | { readonly type: "full" };

/**
 * The normalised policy frozen onto a booking at creation. Supplier policies keep the supplier's
 * own wording in `rawText`; the normalised fields are what the calculator reads.
 */
export type CancellationPolicy = {
  readonly version: typeof CANCELLATION_POLICY_VERSION;
  readonly source: CancellationPolicySource;
  /**
   * Hours before arrival at which free cancellation ends. Arrival is 00:00 UTC on the check-in
   * calendar date, matching the price snapshot. `0` means "until arrival"; `null` means the stay
   * has no free-cancellation window at all.
   */
  readonly freeCancelHoursBeforeArrival: number | null;
  readonly penalty: CancellationPenalty;
  /** The supplier's original policy text, retained verbatim for audits. */
  readonly rawText?: string;
};

export type CancellationPolicyInput = {
  source: CancellationPolicySource;
  freeCancelHoursBeforeArrival: number | null;
  penalty: CancellationPenalty;
  rawText?: string;
};

export type CancellationQuoteInput = {
  policy: CancellationPolicy;
  /** Check-in calendar date; a `Date` is read as its UTC date. */
  checkIn: string | Date;
  /** Check-out calendar date, used to count nights for a `nights` penalty. */
  checkOut: string | Date;
  /** Evaluation instant, inclusive of the deadline itself. */
  now: Date | string;
  totalMinor: number;
  currency: string;
  /** Nightly rates from the booking's price snapshot; improves a `nights` penalty. */
  nightlyRates?: readonly PriceSnapshotNight[];
};

export type CancellationQuote = {
  readonly policy: CancellationPolicy;
  readonly evaluatedAt: string;
  /** Last instant that still qualifies for free cancellation, or `null` when there is no window. */
  readonly deadline: string | null;
  readonly freeCancellation: boolean;
  readonly penaltyMinor: number;
  readonly refundMinor: number;
  readonly currency: CurrencyCode;
};

const HOUR_MS = 60 * 60 * 1000;
const MAX_FREE_CANCEL_HOURS = 24 * 365;
const MAX_PENALTY_NIGHTS = 365;

export class CancellationPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CancellationPolicyError";
  }
}

const isHours = (value: unknown): value is number =>
  value === null ||
  (typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_FREE_CANCEL_HOURS);

const normalizePenalty = (penalty: CancellationPenalty): CancellationPenalty => {
  if (typeof penalty !== "object" || penalty === null) {
    throw new CancellationPolicyError("A cancellation penalty is required");
  }

  switch (penalty.type) {
    case "percent": {
      if (
        typeof penalty.percent !== "number" ||
        !Number.isInteger(penalty.percent) ||
        penalty.percent < 0 ||
        penalty.percent > 100
      ) {
        throw new CancellationPolicyError("A percent penalty must be an integer between 0 and 100");
      }
      return Object.freeze({ type: "percent", percent: penalty.percent });
    }
    case "nights": {
      if (
        typeof penalty.nights !== "number" ||
        !Number.isInteger(penalty.nights) ||
        penalty.nights < 1 ||
        penalty.nights > MAX_PENALTY_NIGHTS
      ) {
        throw new CancellationPolicyError("A nights penalty must be an integer of at least 1");
      }
      return Object.freeze({ type: "nights", nights: penalty.nights });
    }
    case "full":
      return Object.freeze({ type: "full" as const });
    default:
      throw new CancellationPolicyError("Unknown cancellation penalty type");
  }
};

/** Validates and freezes a policy, so a stored snapshot can never be mutated in place. */
export function buildCancellationPolicy(input: CancellationPolicyInput): CancellationPolicy {
  if (input.source !== "managed" && input.source !== "supplier") {
    throw new CancellationPolicyError("Unknown cancellation policy source");
  }
  if (!isHours(input.freeCancelHoursBeforeArrival)) {
    throw new CancellationPolicyError(
      `freeCancelHoursBeforeArrival must be null or an integer between 0 and ${MAX_FREE_CANCEL_HOURS}`,
    );
  }
  if (input.rawText !== undefined && typeof input.rawText !== "string") {
    throw new CancellationPolicyError("rawText must be a string");
  }

  return Object.freeze({
    version: CANCELLATION_POLICY_VERSION,
    source: input.source,
    freeCancelHoursBeforeArrival: input.freeCancelHoursBeforeArrival,
    penalty: normalizePenalty(input.penalty),
    ...(input.rawText === undefined ? {} : { rawText: input.rawText }),
  });
}

/** Reads a policy stored in `bookings.cancellation_policy_snapshot`; undefined when unusable. */
export function readCancellationPolicy(value: unknown): CancellationPolicy | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (record.version !== CANCELLATION_POLICY_VERSION) return undefined;

  try {
    return buildCancellationPolicy({
      source: record.source as CancellationPolicySource,
      freeCancelHoursBeforeArrival: record.freeCancelHoursBeforeArrival as number | null,
      penalty: record.penalty as CancellationPenalty,
      ...(typeof record.rawText === "string" ? { rawText: record.rawText } : {}),
    });
  } catch {
    return undefined;
  }
}

/**
 * The policy applied to directly managed bookings until owners can configure their own in #107:
 * free cancellation until 48 hours before arrival, then one night's accommodation is forfeited.
 */
export const DEFAULT_MANAGED_CANCELLATION_POLICY: CancellationPolicy = buildCancellationPolicy({
  source: "managed",
  freeCancelHoursBeforeArrival: 48,
  penalty: { type: "nights", nights: 1 },
});

const toInstant = (value: Date | string): number => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new CancellationPolicyError(`Invalid evaluation time: ${String(value)}`);
  }
  return date.getTime();
};

const sortedRates = (rates: readonly PriceSnapshotNight[] | undefined): PriceSnapshotNight[] =>
  [...(rates ?? [])]
    .filter((night) => typeof night.date === "string" && Number.isSafeInteger(night.amountMinor))
    .sort((left, right) => left.date.localeCompare(right.date));

/**
 * Works out what a guest gets back when cancelling now. Pure: the caller supplies the clock, the
 * frozen policy and the frozen money, so the same inputs always produce the same minor units.
 *
 * A percent penalty is rounded to the nearest minor unit with half-up rounding; a nights penalty
 * sums the first nightly rates and falls back to an equal share of the total when the snapshot has
 * no rates. Taxes and fees are refunded unless the whole stay is non-refundable.
 */
export function quoteCancellation(input: CancellationQuoteInput): CancellationQuote {
  const currency = normalizeCurrency(input.currency);
  const totalMinor = assertAmountMinor(input.totalMinor);
  if (totalMinor < 0) {
    throw new CancellationPolicyError("A booking total cannot be negative");
  }
  const nowMs = toInstant(input.now);
  const checkIn = toDateOnly(input.checkIn);
  const arrivalMs = parseDateOnly(checkIn).getTime();
  const hours = input.policy.freeCancelHoursBeforeArrival;
  const deadlineMs = hours === null ? null : arrivalMs - hours * HOUR_MS;
  const freeCancellation = deadlineMs !== null && nowMs <= deadlineMs;

  let penaltyMinor: number;
  if (freeCancellation) {
    penaltyMinor = 0;
  } else if (input.policy.penalty.type === "full") {
    penaltyMinor = totalMinor;
  } else if (input.policy.penalty.type === "percent") {
    penaltyMinor = Math.round((totalMinor * input.policy.penalty.percent) / 100);
  } else {
    const rates = sortedRates(input.nightlyRates);
    const stayNights = countNights(input.checkIn, input.checkOut);
    const perNightFallback = Math.round(totalMinor / stayNights);
    penaltyMinor = 0;
    for (let index = 0; index < input.policy.penalty.nights; index += 1) {
      penaltyMinor += rates[index]?.amountMinor ?? perNightFallback;
    }
  }

  const clampedPenalty = Math.min(penaltyMinor, totalMinor);

  return Object.freeze({
    policy: input.policy,
    evaluatedAt: new Date(nowMs).toISOString(),
    deadline: deadlineMs === null ? null : new Date(deadlineMs).toISOString(),
    freeCancellation,
    penaltyMinor: clampedPenalty,
    refundMinor: totalMinor - clampedPenalty,
    currency,
  });
}
