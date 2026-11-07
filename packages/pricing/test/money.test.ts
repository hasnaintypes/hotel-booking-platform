import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  CurrencyMismatchError,
  InvalidMoneyError,
  UnknownCurrencyError,
  add,
  allocate,
  convert,
  fromDecimal,
  isMoney,
  money,
  multiply,
  normalizeCurrency,
  sum,
  toDecimal,
} from "../src/index.js";

describe("money", () => {
  it("normalizes supported ISO currencies", () => {
    expect(normalizeCurrency(" gbp ")).toBe("GBP");
    expect(() => normalizeCurrency("ZZZ")).toThrow(UnknownCurrencyError);
    expect(() => normalizeCurrency("GB")).toThrow(UnknownCurrencyError);
  });

  it("adds and subtracts only matching currencies", () => {
    expect(add(money(1_000, "GBP"), money(250, "GBP"))).toEqual(money(1_250, "GBP"));
    expect(() => add(money(1, "GBP"), money(1, "USD"))).toThrow(CurrencyMismatchError);
  });

  it("rounds major-unit decimals to minor units", () => {
    expect(fromDecimal("1.005", "GBP")).toEqual(money(101, "GBP"));
    expect(fromDecimal("1.005", "GBP", "half-even")).toEqual(money(100, "GBP"));
    expect(fromDecimal("1.999", "JPY")).toEqual(money(2, "JPY"));
    expect(fromDecimal("1.994", "JPY", "down")).toEqual(money(1, "JPY"));
  });

  it("multiplies by exact decimal factors", () => {
    expect(multiply(money(99_900, "GBP"), "0.075")).toEqual(money(7_493, "GBP"));
    expect(multiply(money(100, "JPY"), "1.5", "down")).toEqual(money(150, "JPY"));
  });

  it("converts with an explicit exchange rate", () => {
    expect(convert(money(1_000, "GBP"), "1.25", "USD")).toEqual(money(1_250, "USD"));
    expect(() => convert(money(1_000, "GBP"), "0", "USD")).toThrow(InvalidMoneyError);
  });

  it("rejects unsafe amounts", () => {
    expect(() => money(Number.MAX_SAFE_INTEGER + 1, "GBP")).toThrow(InvalidMoneyError);
    expect(() => money(1.5, "GBP")).toThrow(InvalidMoneyError);
  });

  it("detects money-like values", () => {
    expect(isMoney(money(100, "GBP"))).toBe(true);
    expect(isMoney({ amountMinor: 100, currency: "ZZZ" })).toBe(false);
    expect(isMoney({ amountMinor: 1.5, currency: "GBP" })).toBe(false);
  });

  it("allocates without losing minor units", () => {
    expect(allocate(money(100, "GBP"), [1, 1, 1])).toEqual([
      money(34, "GBP"),
      money(33, "GBP"),
      money(33, "GBP"),
    ]);
    expect(allocate(money(101, "GBP"), [1, 1])).toEqual([money(51, "GBP"), money(50, "GBP")]);
    expect(() => allocate(money(100, "GBP"), [])).toThrow(InvalidMoneyError);
    expect(() => allocate(money(-1, "GBP"), [1])).toThrow(InvalidMoneyError);
  });

  it("sums a list", () => {
    expect(sum([money(100, "GBP"), money(200, "GBP"), money(300, "GBP")])).toEqual(
      money(600, "GBP"),
    );
    expect(() => sum([])).toThrow(InvalidMoneyError);
  });

  it("round-trips safe minor-unit amounts through decimal", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -(2 ** 40), max: 2 ** 40 }),
        fc.constantFrom("GBP", "USD", "JPY"),
        (amountMinor, currency) => {
          const value = money(amountMinor, currency);
          expect(fromDecimal(toDecimal(value), currency)).toEqual(value);
        },
      ),
    );
  });

  it("preserves the total for any positive ratio split", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000_000 }),
        fc.array(fc.integer({ min: 1, max: 1_000 }), { minLength: 1, maxLength: 10 }),
        (amountMinor, ratios) => {
          const shares = allocate(money(amountMinor, "GBP"), ratios);
          expect(shares.reduce((total, share) => total + share.amountMinor, 0)).toBe(amountMinor);
          expect(shares.every((share) => share.amountMinor >= 0)).toBe(true);
        },
      ),
    );
  });
});
