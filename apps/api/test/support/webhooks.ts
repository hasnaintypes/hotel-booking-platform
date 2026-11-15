import { createHmac, randomUUID } from "node:crypto";
import type { TestApp } from "./create-app";
import { anonymous } from "./helpers";
import { routes } from "./routes";

export const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET as string;

const nowSeconds = () => Math.floor(Date.now() / 1000);

/** A Stripe event envelope around `object`, with a fresh id unless one is supplied. */
export function stripeEvent(
  type: string,
  object: Record<string, unknown>,
  id = `evt_${randomUUID()}`,
) {
  return {
    id,
    object: "event",
    api_version: "2025-01-01",
    created: nowSeconds(),
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type,
    data: { object },
  };
}

/** The `Stripe-Signature` header value Stripe would send for `payload`. */
export function stripeSignature(
  payload: string,
  timestamp = nowSeconds(),
  secret = WEBHOOK_SECRET,
): string {
  const digest = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

export const stripePaymentIntent = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  object: "payment_intent",
  amount: 10_000,
  amount_received: 0,
  amount_capturable: 0,
  currency: "gbp",
  status: "requires_payment_method",
  metadata: {},
  ...overrides,
});

/**
 * Delivers a signed webhook the way Stripe retries it: the same payload and signature, so the
 * inbox row decides whether it is applied a second time.
 */
export function deliverStripeWebhook(
  t: TestApp,
  event: ReturnType<typeof stripeEvent>,
  header?: string,
) {
  const payload = JSON.stringify(event);
  return anonymous(t)
    .post(routes.webhooks.stripe)
    .set("Content-Type", "application/json")
    .set("stripe-signature", header ?? stripeSignature(payload))
    .send(payload);
}
