import {
  assertAmountMinor,
  currencyExponent,
  normalizeCurrency,
  type CurrencyCode,
  type RoundingMode,
  DEFAULT_ROUNDING_MODE,
} from "./money.js";

export const PRICE_SNAPSHOT_VERSION = 1 as const;

export type PriceRuleVersions = Readonly<Record<string, string>>;

export type PriceSnapshotNight = {
  readonly date: string;
  readonly amountMinor: number;
};

export type PriceSnapshotFx = {
  readonly rateSnapshotId: string;
  readonly sourceCurrency: CurrencyCode;
  readonly rate: string;
};

export type PriceSnapshotFxInput = {
  readonly rateSnapshotId: string;
  readonly sourceCurrency: string;
  readonly rate: string;
};

export type PriceSnapshot = {
  readonly version: typeof PRICE_SNAPSHOT_VERSION;
  readonly currency: CurrencyCode;
  readonly nights: number;
  readonly nightlyRates: readonly PriceSnapshotNight[];
  readonly subtotalMinor: number;
  readonly taxesMinor: number;
  readonly feesMinor: number;
  readonly totalMinor: number;
  readonly computedAt: string;
  readonly rounding: {
    readonly mode: RoundingMode;
    readonly currencyExponent: number;
  };
  readonly rules: PriceRuleVersions;
  readonly fx?: PriceSnapshotFx;
};

export type BuildPriceSnapshotInput = {
  currency: string;
  nightlyRates: readonly PriceSnapshotNight[];
  taxesMinor?: number;
  feesMinor?: number;
  computedAt: Date | string;
  rounding?: RoundingMode;
  rules?: Readonly<Record<string, string>>;
  fx?: PriceSnapshotFxInput;
};

export class PriceSnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PriceSnapshotError";
  }
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Parses a calendar date at UTC midnight and rejects rolled-over dates such as 2026-02-30. */
export function parseDateOnly(value: string): Date {
  if (!DATE_PATTERN.test(value)) {
    throw new PriceSnapshotError(`Invalid date: ${value}`);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new PriceSnapshotError(`Invalid date: ${value}`);
  }

  return parsed;
}

export function toDateOnly(value: Date | string): string {
  if (typeof value === "string") {
    parseDateOnly(value);
    return value;
  }

  if (Number.isNaN(value.getTime())) {
    throw new PriceSnapshotError("Invalid date");
  }

  return value.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const parsed = parseDateOnly(date);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function countNights(checkIn: string | Date, checkOut: string | Date): number {
  const start = parseDateOnly(toDateOnly(checkIn));
  const end = parseDateOnly(toDateOnly(checkOut));
  const nights = Math.round((end.getTime() - start.getTime()) / 86_400_000);

  if (nights <= 0) {
    throw new PriceSnapshotError("Check-out must be after check-in");
  }

  return nights;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }

  return value;
}

function normalizeComputedAt(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new PriceSnapshotError("Invalid computedAt timestamp");
  }

  return date.toISOString();
}

/**
 * Builds the immutable, versioned quote stored on a booking. Identical inputs (including
 * computedAt) always produce an identical snapshot; callers control the clock.
 */
export function buildPriceSnapshot(input: BuildPriceSnapshotInput): PriceSnapshot {
  const currency = normalizeCurrency(input.currency);
  if (input.nightlyRates.length === 0) {
    throw new PriceSnapshotError("At least one nightly rate is required");
  }

  const seenDates = new Set<string>();
  const nightlyRates = input.nightlyRates
    .map((night) => {
      parseDateOnly(night.date);
      if (seenDates.has(night.date)) {
        throw new PriceSnapshotError(`Duplicate night: ${night.date}`);
      }
      seenDates.add(night.date);

      if (night.amountMinor < 0) {
        throw new PriceSnapshotError("Nightly rates cannot be negative");
      }

      return {
        date: night.date,
        amountMinor: assertAmountMinor(night.amountMinor),
      };
    })
    .sort((left, right) => left.date.localeCompare(right.date));

  const subtotalMinor = nightlyRates.reduce((total, night) => total + night.amountMinor, 0);
  const taxesMinor = assertAmountMinor(input.taxesMinor ?? 0);
  const feesMinor = assertAmountMinor(input.feesMinor ?? 0);

  if (taxesMinor < 0 || feesMinor < 0) {
    throw new PriceSnapshotError("Taxes and fees cannot be negative");
  }

  const totalMinor = subtotalMinor + taxesMinor + feesMinor;
  if (!Number.isSafeInteger(totalMinor)) {
    throw new PriceSnapshotError("Snapshot total exceeds the safe integer range");
  }

  const rules = Object.fromEntries(
    Object.entries(input.rules ?? {}).map(([key, value]) => {
      if (typeof value !== "string") {
        throw new PriceSnapshotError("Rule versions must be strings");
      }
      return [key, value];
    }),
  );

  const snapshot: PriceSnapshot = {
    version: PRICE_SNAPSHOT_VERSION,
    currency,
    nights: nightlyRates.length,
    nightlyRates,
    subtotalMinor,
    taxesMinor,
    feesMinor,
    totalMinor,
    computedAt: normalizeComputedAt(input.computedAt),
    rounding: {
      mode: input.rounding ?? DEFAULT_ROUNDING_MODE,
      currencyExponent: currencyExponent(currency),
    },
    rules,
    ...(input.fx
      ? {
          fx: {
            rateSnapshotId: input.fx.rateSnapshotId,
            sourceCurrency: normalizeCurrency(input.fx.sourceCurrency),
            rate: input.fx.rate,
          },
        }
      : {}),
  };

  return deepFreeze(snapshot);
}
