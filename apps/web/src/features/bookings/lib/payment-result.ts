import type { PaymentIntentResult } from "@stripe/stripe-js";

/** What the checkout should do after Stripe answers a card confirmation. */
export type PaymentOutcome =
  | { kind: "succeeded"; paymentIntentId: string }
  /** The card was not charged; the guest can correct the details and try again. */
  | { kind: "failed"; message: string }
  /** Stripe has not finished; paying again could charge the guest twice. */
  | { kind: "pending"; message: string };

const GENERIC_FAILURE =
  "We couldn't process your payment. Please check your card details and try again.";

export const NETWORK_FAILURE =
  "We couldn't reach the payment service. Check your connection and try again.";

export function interpretPaymentResult(result: PaymentIntentResult): PaymentOutcome {
  if (result.error) {
    const { type, message } = result.error;
    // Stripe words card and validation messages for customers (for example "Your card was declined.").
    if ((type === "card_error" || type === "validation_error") && message) {
      return { kind: "failed", message };
    }
    if (type === "api_connection_error") {
      return { kind: "failed", message: NETWORK_FAILURE };
    }
    return { kind: "failed", message: GENERIC_FAILURE };
  }

  const intent = result.paymentIntent;
  switch (intent?.status) {
    case "succeeded":
      return { kind: "succeeded", paymentIntentId: intent.id };
    case "processing":
      return {
        kind: "pending",
        message:
          "Your payment is still processing. Please don't pay again. Check My Bookings in a few minutes.",
      };
    case "canceled":
      return {
        kind: "failed",
        message: "This payment was cancelled. Please go back and start your booking again.",
      };
    default:
      // requires_action, requires_payment_method, requires_confirmation and anything unexpected.
      return {
        kind: "failed",
        message: "Your payment wasn't completed. Please check your card details and try again.",
      };
  }
}
