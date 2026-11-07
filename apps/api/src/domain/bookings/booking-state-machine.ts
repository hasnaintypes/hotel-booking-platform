import { bookingStatus, type BookingStatus } from "@hotel-booking/db";

export const BOOKING_STATUSES = bookingStatus.enumValues;
export type { BookingStatus };

/**
 * The only legal booking state changes. Creation is not a transition (it has no previous state).
 * `needs_review` deliberately has a path back to every non-review state so an operator can
 * resolve a payment or supplier inconsistency without bypassing the event log.
 */
export const BOOKING_TRANSITIONS = {
  pending_payment: ["authorized", "confirming", "failed", "expired", "cancelled", "needs_review"],
  authorized: ["confirming", "confirmed", "failed", "expired", "cancelled", "needs_review"],
  confirming: ["confirmed", "failed", "cancelled", "needs_review"],
  confirmed: ["cancelling", "cancelled", "needs_review"],
  cancelling: ["cancelled", "needs_review"],
  cancelled: ["needs_review"],
  failed: ["needs_review"],
  expired: ["needs_review"],
  needs_review: [
    "pending_payment",
    "authorized",
    "confirming",
    "confirmed",
    "cancelling",
    "cancelled",
    "failed",
    "expired",
  ],
} as const satisfies Record<BookingStatus, readonly BookingStatus[]>;

export type BookingTransitionActor =
  { type: "user"; userId: string } | { type: "system"; name: string };

export type BookingTransitionInput = {
  bookingId: string;
  from: BookingStatus;
  to: BookingStatus;
  actor: BookingTransitionActor;
  reason?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
};

export class IllegalBookingTransitionError extends Error {
  readonly code = "ILLEGAL_BOOKING_TRANSITION";

  constructor(
    readonly from: BookingStatus,
    readonly to: BookingStatus,
  ) {
    super(`Booking cannot transition from ${from} to ${to}`);
    this.name = "IllegalBookingTransitionError";
  }
}

export class BookingTransitionConflictError extends Error {
  readonly code = "BOOKING_TRANSITION_CONFLICT";

  constructor(
    readonly bookingId: string,
    readonly from: BookingStatus,
    readonly to: BookingStatus,
  ) {
    super(`Booking ${bookingId} is no longer in ${from}; transition to ${to} was rejected`);
    this.name = "BookingTransitionConflictError";
  }
}

export function isBookingStatus(value: unknown): value is BookingStatus {
  return typeof value === "string" && (BOOKING_STATUSES as readonly string[]).includes(value);
}

export function assertBookingStatus(value: unknown): asserts value is BookingStatus {
  if (!isBookingStatus(value)) {
    throw new TypeError(`Unknown booking status: ${String(value)}`);
  }
}

export function allowedNextStatuses(from: BookingStatus): readonly BookingStatus[] {
  return BOOKING_TRANSITIONS[from];
}

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return allowedNextStatuses(from).includes(to);
}

export function assertBookingTransition(from: BookingStatus, to: BookingStatus): void {
  if (!canTransition(from, to)) {
    throw new IllegalBookingTransitionError(from, to);
  }
}
