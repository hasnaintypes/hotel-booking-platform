import type { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";
import { RateLimitedException } from "../../common/errors/rate-limited.exception";
import { AiUsageLimiter } from "./ai-usage-limiter";

const limiter = (perMinute = 3, perDay = 5) =>
  new AiUsageLimiter({
    get: (key: string) => ({ "ai.perMinuteLimit": perMinute, "ai.dailyQuota": perDay })[key],
  } as unknown as ConfigService);

const DAY = 24 * 60 * 60 * 1000;
// Mid-day, so a one-minute step never crosses midnight.
const NOON = 20_000 * DAY + 12 * 60 * 60 * 1000;

const thrown = (fn: () => void) => {
  try {
    fn();
  } catch (error) {
    return error as RateLimitedException;
  }
  return undefined;
};

describe("AiUsageLimiter", () => {
  it("allows requests up to the per-minute limit and then refuses with a wait time", () => {
    const l = limiter(3, 100);
    for (let i = 0; i < 3; i += 1) l.consume("u1", NOON + i * 1000);

    const error = thrown(() => l.consume("u1", NOON + 10_000));

    expect(error).toBeInstanceOf(RateLimitedException);
    expect(error?.retryAfterSeconds).toBeCloseTo(50, 0);
  });

  it("allows requests again once the minute has passed", () => {
    const l = limiter(1, 100);
    l.consume("u1", NOON);
    expect(thrown(() => l.consume("u1", NOON + 30_000))).toBeDefined();
    expect(thrown(() => l.consume("u1", NOON + 60_000))).toBeUndefined();
  });

  it("refuses once the daily quota is used, telling the user to wait until tomorrow", () => {
    const l = limiter(100, 2);
    l.consume("u1", NOON);
    l.consume("u1", NOON + 1);

    const error = thrown(() => l.consume("u1", NOON + 2));

    expect(error?.message).toMatch(/daily/i);
    expect(error?.retryAfterSeconds).toBeCloseTo(12 * 60 * 60, -1);
  });

  it("resets the daily quota on the next UTC day", () => {
    const l = limiter(100, 1);
    l.consume("u1", NOON);
    expect(thrown(() => l.consume("u1", NOON + 1000))).toBeDefined();
    expect(thrown(() => l.consume("u1", NOON + DAY))).toBeUndefined();
  });

  it("counts each user separately", () => {
    const l = limiter(1, 1);
    l.consume("u1", NOON);
    expect(thrown(() => l.consume("u2", NOON))).toBeUndefined();
    expect(thrown(() => l.consume("u1", NOON + 1))).toBeDefined();
  });

  it("does not count a refused request against the quota", () => {
    const l = limiter(1, 2);
    l.consume("u1", NOON);
    expect(thrown(() => l.consume("u1", NOON + 1000))).toBeDefined();
    expect(thrown(() => l.consume("u1", NOON + 61_000))).toBeUndefined();
    expect(thrown(() => l.consume("u1", NOON + 122_000))).toBeDefined();
  });

  it("falls back to sensible defaults when nothing is configured", () => {
    const l = new AiUsageLimiter({ get: () => undefined } as unknown as ConfigService);
    for (let i = 0; i < 5; i += 1) l.consume("u1", NOON + i);
    expect(thrown(() => l.consume("u1", NOON + 6))).toBeDefined();
  });
});
