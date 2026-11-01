import type { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";
import { RateLimitedException } from "../../common/errors/rate-limited.exception";
import { LoginAttemptTracker } from "./login-attempts";

const tracker = (maxFailures = 3) =>
  new LoginAttemptTracker({
    get: (key: string) => ({ "auth.maxFailedLogins": maxFailures })[key],
  } as unknown as ConfigService);

const MINUTE = 60_000;
const T0 = 1_000_000_000;

const locked = (t: LoginAttemptTracker, email: string, now: number) => {
  try {
    t.assertNotLocked(email, now);
    return undefined;
  } catch (error) {
    return error as RateLimitedException;
  }
};

describe("LoginAttemptTracker", () => {
  it("does not lock an account with no failures", () => {
    expect(locked(tracker(), "a@x.test", T0)).toBeUndefined();
  });

  it("locks an account after the allowed number of failures, with the time left", () => {
    const t = tracker(3);
    for (let i = 0; i < 3; i += 1) t.recordFailure("a@x.test", T0 + i * 1000);

    const error = locked(t, "a@x.test", T0 + 5 * MINUTE);

    expect(error).toBeInstanceOf(RateLimitedException);
    expect(error?.retryAfterSeconds).toBeCloseTo(10 * 60, -1);
  });

  it("does not lock before the limit is reached", () => {
    const t = tracker(3);
    t.recordFailure("a@x.test", T0);
    t.recordFailure("a@x.test", T0 + 1);
    expect(locked(t, "a@x.test", T0 + 2)).toBeUndefined();
  });

  it("unlocks once the 15 minute window has passed", () => {
    const t = tracker(2);
    t.recordFailure("a@x.test", T0);
    t.recordFailure("a@x.test", T0 + 1);

    expect(locked(t, "a@x.test", T0 + 14 * MINUTE)).toBeDefined();
    expect(locked(t, "a@x.test", T0 + 15 * MINUTE + 1)).toBeUndefined();
  });

  it("starts counting again after the window", () => {
    const t = tracker(2);
    t.recordFailure("a@x.test", T0);
    t.recordFailure("a@x.test", T0 + 20 * MINUTE);
    expect(locked(t, "a@x.test", T0 + 20 * MINUTE + 1)).toBeUndefined();
  });

  it("forgets the failures after a successful sign-in", () => {
    const t = tracker(2);
    t.recordFailure("a@x.test", T0);
    t.clear("a@x.test");
    t.recordFailure("a@x.test", T0 + 1);
    expect(locked(t, "a@x.test", T0 + 2)).toBeUndefined();
  });

  it("treats the address case-insensitively and ignores surrounding spaces", () => {
    const t = tracker(2);
    t.recordFailure("Alice@X.test", T0);
    t.recordFailure("  alice@x.test ", T0 + 1);
    expect(locked(t, "ALICE@x.test", T0 + 2)).toBeDefined();
  });

  it("counts each account separately", () => {
    const t = tracker(1);
    t.recordFailure("a@x.test", T0);
    expect(locked(t, "a@x.test", T0 + 1)).toBeDefined();
    expect(locked(t, "b@x.test", T0 + 1)).toBeUndefined();
  });

  it("uses the default of five failures when nothing is configured", () => {
    const t = new LoginAttemptTracker({ get: () => undefined } as unknown as ConfigService);
    for (let i = 0; i < 4; i += 1) t.recordFailure("a@x.test", T0 + i);
    expect(locked(t, "a@x.test", T0 + 10)).toBeUndefined();
    t.recordFailure("a@x.test", T0 + 11);
    expect(locked(t, "a@x.test", T0 + 12)).toBeDefined();
  });
});
