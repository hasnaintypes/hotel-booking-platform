import { describe, expect, it } from "vitest";
import {
  BOOKING_STATUSES,
  BOOKING_TRANSITIONS,
  IllegalBookingTransitionError,
  allowedNextStatuses,
  assertBookingTransition,
  canTransition,
} from "./booking-state-machine";

describe("booking state machine", () => {
  it("defines a destination list for every status", () => {
    expect(Object.keys(BOOKING_TRANSITIONS).sort()).toEqual([...BOOKING_STATUSES].sort());
  });

  it("contains no self transitions", () => {
    for (const from of BOOKING_STATUSES) {
      expect(allowedNextStatuses(from)).not.toContain(from);
    }
  });

  it("matches the transition table for every status pair", () => {
    for (const from of BOOKING_STATUSES) {
      for (const to of BOOKING_STATUSES) {
        expect(canTransition(from, to), `${from} -> ${to}`).toBe(
          (BOOKING_TRANSITIONS[from] as readonly string[]).includes(to),
        );
      }
    }
  });

  it("rejects every transition not in the table", () => {
    for (const from of BOOKING_STATUSES) {
      for (const to of BOOKING_STATUSES) {
        if ((BOOKING_TRANSITIONS[from] as readonly string[]).includes(to)) {
          expect(() => assertBookingTransition(from, to)).not.toThrow();
        } else {
          expect(() => assertBookingTransition(from, to)).toThrow(IllegalBookingTransitionError);
        }
      }
    }
  });

  it("lets an operator recover from needs_review into every normal state", () => {
    const normal = BOOKING_STATUSES.filter((status) => status !== "needs_review");
    expect(allowedNextStatuses("needs_review")).toEqual(expect.arrayContaining(normal));
  });

  it("only allows terminal states to move into needs_review", () => {
    expect(allowedNextStatuses("cancelled")).toEqual(["needs_review"]);
    expect(allowedNextStatuses("failed")).toEqual(["needs_review"]);
    expect(allowedNextStatuses("expired")).toEqual(["needs_review"]);
  });
});
