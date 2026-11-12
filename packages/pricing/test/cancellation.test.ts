import { describe, expect, it } from "vitest";
import {
  CANCELLATION_POLICY_VERSION,
  CancellationPolicyError,
  DEFAULT_MANAGED_CANCELLATION_POLICY,
  buildCancellationPolicy,
  quoteCancellation,
  readCancellationPolicy,
} from "../src/index.js";

const managed = (freeCancelHoursBeforeArrival: number | null, penalty: unknown) =>
  buildCancellationPolicy({
    source: "managed",
    freeCancelHoursBeforeArrival,
    penalty: penalty as Parameters<typeof buildCancellationPolicy>[0]["penalty"],
  });

const stay = {
  checkIn: "2027-06-01",
  checkOut: "2027-06-04",
  totalMinor: 30_000,
  currency: "GBP",
} as const;

describe("cancellation policies", () => {
  it("builds a frozen, versioned policy", () => {
    const policy = managed(48, { type: "percent", percent: 25 });

    expect(policy).toEqual({
      version: CANCELLATION_POLICY_VERSION,
      source: "managed",
      freeCancelHoursBeforeArrival: 48,
      penalty: { type: "percent", percent: 25 },
    });
    expect(Object.isFrozen(policy)).toBe(true);
    expect(Object.isFrozen(policy.penalty)).toBe(true);
  });

  it("keeps supplier wording alongside the normalised fields", () => {
    const policy = buildCancellationPolicy({
      source: "supplier",
      freeCancelHoursBeforeArrival: 24,
      penalty: { type: "full" },
      rawText: "Non-refundable within 24 hours of arrival.",
    });
    expect(policy.rawText).toBe("Non-refundable within 24 hours of arrival.");
  });

  it("exposes the default managed policy", () => {
    expect(DEFAULT_MANAGED_CANCELLATION_POLICY).toMatchObject({
      source: "managed",
      freeCancelHoursBeforeArrival: 48,
      penalty: { type: "nights", nights: 1 },
    });
  });

  it.each([
    ["an unknown source", { source: "ota", freeCancelHoursBeforeArrival: 48 }],
    ["a negative window", { source: "managed", freeCancelHoursBeforeArrival: -1 }],
    ["a fractional window", { source: "managed", freeCancelHoursBeforeArrival: 1.5 }],
    ["a percent above 100", { source: "managed", penalty: { type: "percent", percent: 101 } }],
    ["a fractional percent", { source: "managed", penalty: { type: "percent", percent: 12.5 } }],
    ["zero nights", { source: "managed", penalty: { type: "nights", nights: 0 } }],
    ["an unknown penalty", { source: "managed", penalty: { type: "fee", amount: 10 } }],
    ["no penalty", { source: "managed", penalty: undefined }],
  ])("rejects %s", (_name, input) => {
    const policy = input as {
      source: string;
      freeCancelHoursBeforeArrival?: number;
      penalty?: unknown;
    };
    expect(() =>
      buildCancellationPolicy({
        source: policy.source as "managed",
        freeCancelHoursBeforeArrival: policy.freeCancelHoursBeforeArrival ?? 48,
        penalty: policy.penalty as never,
      }),
    ).toThrow(CancellationPolicyError);
  });

  it("reads a stored snapshot and rejects junk", () => {
    const stored = {
      version: 1,
      source: "managed",
      freeCancelHoursBeforeArrival: 72,
      penalty: { type: "nights", nights: 2 },
    };

    expect(readCancellationPolicy(stored)).toEqual(stored);
    expect(readCancellationPolicy(null)).toBeUndefined();
    expect(readCancellationPolicy("nope")).toBeUndefined();
    expect(readCancellationPolicy({ ...stored, version: 2 })).toBeUndefined();
    expect(
      readCancellationPolicy({ ...stored, penalty: { type: "percent", percent: 250 } }),
    ).toBeUndefined();
  });
});

describe("cancellation calculator", () => {
  it("refunds everything up to and including the deadline", () => {
    const policy = managed(48, { type: "nights", nights: 1 });
    const atDeadline = quoteCancellation({
      ...stay,
      policy,
      now: "2027-05-30T00:00:00.000Z",
    });
    const justBefore = quoteCancellation({
      ...stay,
      policy,
      now: "2027-05-29T23:59:59.999Z",
    });

    expect(atDeadline).toMatchObject({
      deadline: "2027-05-30T00:00:00.000Z",
      freeCancellation: true,
      penaltyMinor: 0,
      refundMinor: 30_000,
    });
    expect(justBefore.freeCancellation).toBe(true);
  });

  it("applies a percent penalty after the deadline", () => {
    const quote = quoteCancellation({
      ...stay,
      policy: managed(48, { type: "percent", percent: 25 }),
      now: "2027-05-31T12:00:00.000Z",
    });

    expect(quote).toMatchObject({
      deadline: "2027-05-30T00:00:00.000Z",
      freeCancellation: false,
      penaltyMinor: 7_500,
      refundMinor: 22_500,
      currency: "GBP",
    });
  });

  it("rounds a percent penalty to the nearest minor unit", () => {
    const quote = quoteCancellation({
      ...stay,
      totalMinor: 999,
      policy: managed(0, { type: "percent", percent: 33 }),
      now: "2027-06-01T00:00:01.000Z",
    });

    expect(quote.penaltyMinor).toBe(330);
    expect(quote.refundMinor).toBe(669);
  });

  it("forfeits the first nightly rates for a nights penalty", () => {
    const quote = quoteCancellation({
      ...stay,
      policy: managed(48, { type: "nights", nights: 2 }),
      now: "2027-05-31T00:00:00.000Z",
      nightlyRates: [
        { date: "2027-06-03", amountMinor: 9_000 },
        { date: "2027-06-01", amountMinor: 10_000 },
        { date: "2027-06-02", amountMinor: 12_000 },
      ],
    });

    expect(quote.penaltyMinor).toBe(22_000);
    expect(quote.refundMinor).toBe(8_000);
  });

  it("falls back to an equal per-night share when the snapshot has no rates", () => {
    const quote = quoteCancellation({
      ...stay,
      policy: managed(48, { type: "nights", nights: 2 }),
      now: "2027-05-31T00:00:00.000Z",
    });

    expect(quote.penaltyMinor).toBe(20_000);
    expect(quote.refundMinor).toBe(10_000);
  });

  it("refunds nothing for a non-refundable policy and clamps a penalty to the total", () => {
    const full = quoteCancellation({
      ...stay,
      policy: managed(48, { type: "full" }),
      now: "2027-05-31T00:00:00.000Z",
    });
    const excessive = quoteCancellation({
      ...stay,
      policy: managed(48, { type: "nights", nights: 365 }),
      now: "2027-05-31T00:00:00.000Z",
    });

    expect(full).toMatchObject({ penaltyMinor: 30_000, refundMinor: 0 });
    expect(excessive).toMatchObject({ penaltyMinor: 30_000, refundMinor: 0 });
  });

  it("treats a null window as never free and a zero-hour window as free until arrival", () => {
    const noWindow = quoteCancellation({
      ...stay,
      policy: managed(null, { type: "full" }),
      now: "2027-01-01T00:00:00.000Z",
    });
    const untilArrival = quoteCancellation({
      ...stay,
      policy: managed(0, { type: "full" }),
      now: "2027-06-01T00:00:00.000Z",
    });

    expect(noWindow).toMatchObject({ deadline: null, freeCancellation: false, refundMinor: 0 });
    expect(untilArrival).toMatchObject({
      deadline: "2027-06-01T00:00:00.000Z",
      freeCancellation: true,
      refundMinor: 30_000,
    });
  });

  it("evaluates instants, so the caller's UTC offset never changes the result", () => {
    const policy = managed(48, { type: "nights", nights: 1 });
    const input = {
      ...stay,
      checkIn: "2027-03-29",
      checkOut: "2027-03-31",
      policy,
    };

    // The same instant, written in UTC and in +01:00, either side of the UK DST switch.
    const utc = quoteCancellation({ ...input, now: "2027-03-27T00:00:00.000Z" });
    const offset = quoteCancellation({ ...input, now: "2027-03-27T01:00:00.000+01:00" });
    const laterInLondon = quoteCancellation({ ...input, now: "2027-03-27T00:00:01.000Z" });

    expect(offset).toMatchObject({
      evaluatedAt: "2027-03-27T00:00:00.000Z",
      freeCancellation: true,
      refundMinor: utc.refundMinor,
    });
    expect(laterInLondon.freeCancellation).toBe(false);
    expect(laterInLondon.refundMinor).toBe(15_000);
  });

  it("uses the UTC calendar date of a Date check-in", () => {
    const quote = quoteCancellation({
      ...stay,
      checkIn: new Date("2027-06-01T23:30:00.000Z"),
      checkOut: new Date("2027-06-03T23:30:00.000Z"),
      policy: managed(24, { type: "percent", percent: 100 }),
      now: "2027-05-31T00:00:00.000Z",
    });

    expect(quote.deadline).toBe("2027-05-31T00:00:00.000Z");
    expect(quote.freeCancellation).toBe(true);
  });

  it("rejects invalid money and clock input", () => {
    expect(() =>
      quoteCancellation({
        ...stay,
        totalMinor: -1,
        policy: managed(48, { type: "full" }),
        now: "2027-05-01T00:00:00.000Z",
      }),
    ).toThrow(CancellationPolicyError);

    expect(() =>
      quoteCancellation({
        ...stay,
        policy: managed(48, { type: "full" }),
        now: "not-a-date",
      }),
    ).toThrow(CancellationPolicyError);
  });
});
