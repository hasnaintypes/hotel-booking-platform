import Decimal from "decimal.js";

/**
 * Minor-unit exponents for the currencies this platform is expected to handle.
 * An unknown ISO code is rejected rather than silently assumed to have two decimals.
 */
export const CURRENCY_EXPONENTS = {
  AED: 2,
  AUD: 2,
  BRL: 2,
  CAD: 2,
  CHF: 2,
  CNY: 2,
  CZK: 2,
  DKK: 2,
  EUR: 2,
  GBP: 2,
  HKD: 2,
  HUF: 2,
  INR: 2,
  JPY: 0,
  KRW: 0,
  MXN: 2,
  NOK: 2,
  NZD: 2,
  PLN: 2,
  SEK: 2,
  SGD: 2,
  TRY: 2,
  USD: 2,
  ZAR: 2,
} as const;

export type CurrencyCode = keyof typeof CURRENCY_EXPONENTS;
export type RoundingMode = "half-up" | "half-even" | "down" | "up";

/** Financial amounts round half away from zero unless a caller explicitly chooses otherwise. */
export const DEFAULT_ROUNDING_MODE: RoundingMode = "half-up";

export type Money = {
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
};

const ROUNDING_MODES: Record<RoundingMode, Decimal.Rounding> = {
  "half-up": Decimal.ROUND_HALF_UP,
  "half-even": Decimal.ROUND_HALF_EVEN,
  down: Decimal.ROUND_DOWN,
  up: Decimal.ROUND_UP,
};

const CURRENCY_PATTERN = /^[A-Z]{3}$/;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

export class InvalidMoneyError extends MoneyError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidMoneyError";
  }
}

export class UnknownCurrencyError extends MoneyError {
  constructor(currency: string) {
    super(`Unknown currency: ${currency}`);
    this.name = "UnknownCurrencyError";
  }
}

export class CurrencyMismatchError extends MoneyError {
  constructor(left: string, right: string) {
    super(`Cannot combine ${left} and ${right}`);
    this.name = "CurrencyMismatchError";
  }
}

export function normalizeCurrency(currency: string): CurrencyCode {
  if (typeof currency !== "string") {
    throw new InvalidMoneyError("Currency must be a string");
  }

  const normalized = currency.trim().toUpperCase();
  if (!CURRENCY_PATTERN.test(normalized) || !(normalized in CURRENCY_EXPONENTS)) {
    throw new UnknownCurrencyError(currency);
  }

  return normalized as CurrencyCode;
}

export function currencyExponent(currency: string): number {
  return CURRENCY_EXPONENTS[normalizeCurrency(currency)];
}

export function assertAmountMinor(amountMinor: number): number {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new InvalidMoneyError("Amount must be a safe integer in minor units");
  }
  return amountMinor;
}

export function money(amountMinor: number, currency: string): Money {
  return Object.freeze({
    amountMinor: assertAmountMinor(amountMinor),
    currency: normalizeCurrency(currency),
  });
}

export function zero(currency: string): Money {
  return money(0, currency);
}

export function isMoney(value: unknown): value is Money {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<Money>;
  return (
    Number.isSafeInteger(candidate.amountMinor) &&
    typeof candidate.currency === "string" &&
    CURRENCY_PATTERN.test(candidate.currency) &&
    candidate.currency in CURRENCY_EXPONENTS
  );
}

export function assertSameCurrency(left: Money, right: Money): CurrencyCode {
  if (left.currency !== right.currency) {
    throw new CurrencyMismatchError(left.currency, right.currency);
  }
  return left.currency;
}

/** Converts a minor-unit amount to its major-unit decimal representation. */
export function toDecimal(value: Money): Decimal {
  return new Decimal(value.amountMinor).dividedBy(
    new Decimal(10).pow(currencyExponent(value.currency)),
  );
}

/** Converts a major-unit decimal value to safe integer minor units, applying the rounding policy. */
export function fromDecimal(
  value: Decimal.Value,
  currency: string,
  rounding: RoundingMode = DEFAULT_ROUNDING_MODE,
): Money {
  const normalized = normalizeCurrency(currency);
  const exponent = CURRENCY_EXPONENTS[normalized];
  const scaled = new Decimal(value)
    .times(new Decimal(10).pow(exponent))
    .toDecimalPlaces(0, ROUNDING_MODES[rounding]);

  if (!scaled.isFinite()) {
    throw new InvalidMoneyError("Amount must be finite");
  }

  return money(scaled.toNumber(), normalized);
}

export function add(left: Money, right: Money): Money {
  assertSameCurrency(left, right);
  return money(left.amountMinor + right.amountMinor, left.currency);
}

export function subtract(left: Money, right: Money): Money {
  assertSameCurrency(left, right);
  return money(left.amountMinor - right.amountMinor, left.currency);
}

export function negate(value: Money): Money {
  return money(-value.amountMinor, value.currency);
}

export function sum(values: readonly Money[]): Money {
  const first = values[0];
  if (!first) {
    throw new InvalidMoneyError("Cannot sum an empty money list");
  }

  return values.slice(1).reduce((total, value) => add(total, value), first);
}

export function multiply(
  value: Money,
  factor: Decimal.Value,
  rounding: RoundingMode = DEFAULT_ROUNDING_MODE,
): Money {
  return fromDecimal(toDecimal(value).times(factor), value.currency, rounding);
}

/** Converts using an exact decimal rate (for example a stored FX snapshot) and rounds to the target. */
export function convert(
  value: Money,
  rate: Decimal.Value,
  targetCurrency: string,
  rounding: RoundingMode = DEFAULT_ROUNDING_MODE,
): Money {
  const decimalRate = new Decimal(rate);
  if (!decimalRate.isFinite() || decimalRate.lte(0)) {
    throw new InvalidMoneyError("Exchange rate must be a positive finite number");
  }

  return fromDecimal(toDecimal(value).times(decimalRate), targetCurrency, rounding);
}

/**
 * Splits an amount without losing minor units. Each share is floored and the remaining minor
 * units go to the largest fractional remainders, preserving the original total exactly.
 */
export function allocate(value: Money, ratios: readonly Decimal.Value[]): readonly Money[] {
  if (ratios.length === 0) {
    throw new InvalidMoneyError("At least one ratio is required");
  }
  if (value.amountMinor < 0) {
    throw new InvalidMoneyError("Cannot allocate a negative amount");
  }

  const decimalRatios = ratios.map((ratio) => new Decimal(ratio));
  if (decimalRatios.some((ratio) => !ratio.isFinite() || ratio.lte(0))) {
    throw new InvalidMoneyError("Ratios must be positive finite numbers");
  }

  const totalRatio = decimalRatios.reduce((total, ratio) => total.plus(ratio), new Decimal(0));
  if (totalRatio.lte(0)) {
    throw new InvalidMoneyError("Ratio total must be positive");
  }

  const rawShares = decimalRatios.map((ratio) =>
    new Decimal(value.amountMinor).times(ratio).dividedBy(totalRatio),
  );
  const shares = rawShares.map((share) => share.floor().toNumber());
  const allocated = shares.reduce((total, share) => total + share, 0);
  const remaining = value.amountMinor - allocated;

  const order = rawShares
    .map((share, index) => ({
      index,
      fraction: share.minus(share.floor()),
    }))
    .sort((left, right) => right.fraction.comparedTo(left.fraction) || left.index - right.index);

  for (let index = 0; index < remaining; index += 1) {
    shares[order[index].index] += 1;
  }

  return Object.freeze(shares.map((share) => money(share, value.currency)));
}
