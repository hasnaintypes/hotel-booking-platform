import type { Clock } from "../../src/common/clock";

const MINUTE_MS = 60_000;

export type FakeClock = Clock & {
  /** Moves time forward without sleeping. */
  advance(minutes: number): void;
  /** Sets the current instant, for a test that needs a specific wall-clock moment. */
  set(date: Date): void;
  /** An instant `minutes` away from now, for backdated fixtures and expiry thresholds. */
  at(minutes: number): Date;
  /** The current instant as an ISO string, which is what the repositories accept. */
  iso(): string;
};

/** A controllable time source injected through the `CLOCK` token. */
export function createFakeClock(start: Date = new Date()): FakeClock {
  let current = new Date(start);

  return {
    now: () => new Date(current),
    set: (date) => {
      current = new Date(date);
    },
    advance: (minutes) => {
      current = new Date(current.getTime() + minutes * MINUTE_MS);
    },
    at: (minutes) => new Date(current.getTime() + minutes * MINUTE_MS),
    iso: () => current.toISOString(),
  };
}
