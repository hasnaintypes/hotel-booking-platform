import type { PaymentStatus } from "@hotel-booking/db";

/**
 * Maps a Stripe PaymentIntent status to the local payment lifecycle. `undefined` means Stripe
 * reported a state this service does not model, which is never treated as a match.
 */
export function localStatusFromIntentStatus(intentStatus: string): PaymentStatus | undefined {
  switch (intentStatus) {
    case "succeeded":
      return "paid";
    case "requires_capture":
      return "authorized";
    case "canceled":
      return "failed";
    case "requires_payment_method":
    case "requires_confirmation":
    case "requires_action":
    case "processing":
      return "pending";
    default:
      return undefined;
  }
}

/** True when the provider status is a legitimate representation of the local status. */
export function matchesIntentStatus(local: PaymentStatus, intentStatus: string): boolean {
  const mapped = localStatusFromIntentStatus(intentStatus);
  if (!mapped) return false;
  // A local `refunded` row is a refund child, not a charge; the caller never compares those here.
  return mapped === local;
}
