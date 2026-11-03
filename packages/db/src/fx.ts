import { and, desc, eq, gt, isNull, lte, or } from "drizzle-orm";
import type { Database } from "./client.js";
import { exchangeRates } from "./schema/exchange-rates.js";

/** Rates older than this are considered stale when no caller-specific limit is supplied. */
export const DEFAULT_EXCHANGE_RATE_MAX_AGE_MS = 24 * 60 * 60 * 1_000;

export type RateCandidate = {
  id: string;
  baseCode: string;
  quoteCode: string;
  rate: string;
  source: string;
  observedAt: Date;
  validFrom: Date;
  validTo: Date | null;
  createdAt: Date;
};

export type ExchangeRateLookup = {
  baseCode: string;
  quoteCode: string;
  at?: Date;
  maxAgeMs?: number;
};

export type ExchangeRateResult =
  | { status: "missing" }
  | {
      status: "found" | "stale";
      exchangeRateId: string | null;
      baseCode: string;
      quoteCode: string;
      rate: string;
      source: string;
      observedAt: Date;
      validFrom: Date;
      validTo: Date | null;
      ageMs: number;
    };

const byLatest = (left: RateCandidate, right: RateCandidate) =>
  right.validFrom.getTime() - left.validFrom.getTime() ||
  right.observedAt.getTime() - left.observedAt.getTime() ||
  right.createdAt.getTime() - left.createdAt.getTime() ||
  right.id.localeCompare(left.id);

/**
 * Picks the latest rate that is valid at `at`. A rate whose `observed_at` is older than
 * `maxAgeMs` is returned as `stale` rather than silently used, so callers can refuse to price a
 * booking on an old rate.
 */
export function selectApplicableRate(
  rates: readonly RateCandidate[],
  at: Date,
  maxAgeMs: number = DEFAULT_EXCHANGE_RATE_MAX_AGE_MS,
): ExchangeRateResult {
  const applicable = rates
    .filter(
      (rate) =>
        rate.observedAt.getTime() <= at.getTime() &&
        rate.validFrom.getTime() <= at.getTime() &&
        (rate.validTo === null || rate.validTo.getTime() > at.getTime()),
    )
    .sort(byLatest);

  const rate = applicable[0];
  if (!rate) return { status: "missing" };

  const ageMs = at.getTime() - rate.observedAt.getTime();
  const result = {
    exchangeRateId: rate.id,
    baseCode: rate.baseCode,
    quoteCode: rate.quoteCode,
    rate: rate.rate,
    source: rate.source,
    observedAt: rate.observedAt,
    validFrom: rate.validFrom,
    validTo: rate.validTo,
    ageMs,
  };

  return ageMs > maxAgeMs ? { status: "stale", ...result } : { status: "found", ...result };
}

export type ExchangeRateDatabase = Pick<Database, "select">;

/**
 * Looks up the latest applicable rate from PostgreSQL. Same-currency lookups return the identity
 * rate without a database round trip.
 */
export async function lookupExchangeRate(
  db: ExchangeRateDatabase,
  { baseCode, quoteCode, at = new Date(), maxAgeMs }: ExchangeRateLookup,
): Promise<ExchangeRateResult> {
  if (baseCode === quoteCode) {
    return {
      status: "found",
      exchangeRateId: null,
      baseCode,
      quoteCode,
      rate: "1",
      source: "identity",
      observedAt: at,
      validFrom: at,
      validTo: null,
      ageMs: 0,
    };
  }

  const rows = await db
    .select({
      id: exchangeRates.id,
      baseCode: exchangeRates.baseCode,
      quoteCode: exchangeRates.quoteCode,
      rate: exchangeRates.rate,
      source: exchangeRates.source,
      observedAt: exchangeRates.observedAt,
      validFrom: exchangeRates.validFrom,
      validTo: exchangeRates.validTo,
      createdAt: exchangeRates.createdAt,
    })
    .from(exchangeRates)
    .where(
      and(
        eq(exchangeRates.baseCode, baseCode),
        eq(exchangeRates.quoteCode, quoteCode),
        lte(exchangeRates.observedAt, at),
        lte(exchangeRates.validFrom, at),
        or(isNull(exchangeRates.validTo), gt(exchangeRates.validTo, at)),
      ),
    )
    .orderBy(
      desc(exchangeRates.validFrom),
      desc(exchangeRates.observedAt),
      desc(exchangeRates.createdAt),
      desc(exchangeRates.id),
    );

  return selectApplicableRate(rows, at, maxAgeMs);
}
