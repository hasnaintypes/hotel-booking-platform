import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  PRICE_SNAPSHOT_VERSION,
  PriceSnapshotError,
  addDays,
  buildPriceSnapshot,
  countNights,
  parseDateOnly,
  quoteStay,
} from "../src/index.js";

const computedAt = "2026-01-01T12:00:00.000Z";

describe("price snapshots", () => {
  it("builds a deterministic, frozen, sorted snapshot", () => {
    const snapshot = buildPriceSnapshot({
      currency: "GBP",
      nightlyRates: [
        { date: "2026-01-03", amountMinor: 12_000 },
        { date: "2026-01-01", amountMinor: 10_000 },
        { date: "2026-01-02", amountMinor: 11_000 },
      ],
      taxesMinor: 2_500,
      feesMinor: 500,
      computedAt,
      rules: { base: "v1", tax: "v2" },
    });

    expect(snapshot).toMatchObject({
      version: PRICE_SNAPSHOT_VERSION,
      currency: "GBP",
      nights: 3,
      subtotalMinor: 33_000,
      taxesMinor: 2_500,
      feesMinor: 500,
      totalMinor: 36_000,
      computedAt,
      rounding: { mode: "half-up", currencyExponent: 2 },
    });
    expect(snapshot.nightlyRates.map((night) => night.date)).toEqual([
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
    ]);
    expect(
      buildPriceSnapshot({
        currency: "GBP",
        nightlyRates: [
          { date: "2026-01-01", amountMinor: 10_000 },
          { date: "2026-01-02", amountMinor: 11_000 },
          { date: "2026-01-03", amountMinor: 12_000 },
        ],
        taxesMinor: 2_500,
        feesMinor: 500,
        computedAt,
        rules: { base: "v1", tax: "v2" },
      }),
    ).toEqual(snapshot);

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.nightlyRates)).toBe(true);
    expect(Object.isFrozen(snapshot.nightlyRates[0])).toBe(true);
    expect(Object.isFrozen(snapshot.rounding)).toBe(true);
    expect(Object.isFrozen(snapshot.rules)).toBe(true);
  });

  it("rejects invalid and duplicate nights", () => {
    expect(() =>
      buildPriceSnapshot({
        currency: "GBP",
        nightlyRates: [{ date: "2026-02-30", amountMinor: 100 }],
        computedAt,
      }),
    ).toThrow(PriceSnapshotError);

    expect(() =>
      buildPriceSnapshot({
        currency: "GBP",
        nightlyRates: [
          { date: "2026-01-01", amountMinor: 100 },
          { date: "2026-01-01", amountMinor: 100 },
        ],
        computedAt,
      }),
    ).toThrow(PriceSnapshotError);
  });

  it("rejects empty, negative and out-of-range amounts", () => {
    expect(() => buildPriceSnapshot({ currency: "GBP", nightlyRates: [], computedAt })).toThrow(
      PriceSnapshotError,
    );

    expect(() =>
      buildPriceSnapshot({
        currency: "GBP",
        nightlyRates: [{ date: "2026-01-01", amountMinor: -1 }],
        computedAt,
      }),
    ).toThrow(PriceSnapshotError);

    expect(() =>
      buildPriceSnapshot({
        currency: "GBP",
        nightlyRates: [{ date: "2026-01-01", amountMinor: 100 }],
        taxesMinor: -1,
        computedAt,
      }),
    ).toThrow(PriceSnapshotError);
  });

  it("rejects mismatched currencies and invalid timestamps", () => {
    expect(() =>
      buildPriceSnapshot({
        currency: "GBP",
        nightlyRates: [{ date: "2026-01-01", amountMinor: 100 }],
        computedAt: "not-a-date",
      }),
    ).toThrow(PriceSnapshotError);
    expect(() =>
      buildPriceSnapshot({
        currency: "GBP",
        nightlyRates: [{ date: "2026-01-01", amountMinor: 100 }],
        computedAt,
        fx: { rateSnapshotId: "fx", sourceCurrency: "ZZZ", rate: "1.2" },
      }),
    ).toThrow();
  });
});

describe("stay quotes", () => {
  it("counts calendar nights across month and leap-year boundaries", () => {
    expect(countNights("2026-01-31", "2026-02-02")).toBe(2);
    expect(countNights("2024-02-28", "2024-03-01")).toBe(2);
    expect(countNights(new Date("2026-12-31T00:00:00Z"), new Date("2027-01-02T00:00:00Z"))).toBe(2);
    expect(() => countNights("2026-01-01", "2026-01-01")).toThrow(PriceSnapshotError);
    expect(() => countNights("2026-01-02", "2026-01-01")).toThrow(PriceSnapshotError);
  });

  it("parses only real date-only values", () => {
    expect(parseDateOnly("2026-01-01").toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(() => parseDateOnly("2026-1-1")).toThrow(PriceSnapshotError);
    expect(() => parseDateOnly("2026-02-29")).toThrow(PriceSnapshotError);
    expect(() => parseDateOnly("2024-02-29")).not.toThrow();
  });

  it("quotes each night at the nightly rate", () => {
    const snapshot = quoteStay({
      currency: "GBP",
      nightlyRateMinor: 12_500,
      checkIn: "2026-03-01",
      checkOut: "2026-03-04",
      taxesMinor: 1_000,
      feesMinor: 250,
      computedAt,
      rules: { base: "v1" },
    });

    expect(snapshot.nights).toBe(3);
    expect(snapshot.nightlyRates.map((night) => night.date)).toEqual([
      "2026-03-01",
      "2026-03-02",
      "2026-03-03",
    ]);
    expect(snapshot.subtotalMinor).toBe(37_500);
    expect(snapshot.totalMinor).toBe(38_750);
  });

  it("quotes a total that always equals nights times the rate", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 30 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 100_000 }),
        (nights, nightlyRateMinor, taxesMinor) => {
          const snapshot = quoteStay({
            currency: "GBP",
            nightlyRateMinor,
            checkIn: "2026-01-01",
            checkOut: addDays("2026-01-01", nights),
            taxesMinor,
            computedAt,
          });
          expect(snapshot.nights).toBe(nights);
          expect(snapshot.totalMinor).toBe(nightlyRateMinor * nights + taxesMinor);
        },
      ),
    );
  });
});
