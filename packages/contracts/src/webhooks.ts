import { z } from "zod";

/**
 * `POST /webhooks/stripe`. The route is unauthenticated by design — the Stripe signature over the
 * raw body is the only authentication — and acknowledges every event it accepts.
 */
export const stripeWebhookAckSchema = z.object({
  received: z.literal(true),
  duplicate: z.boolean(),
});

export type StripeWebhookAck = z.infer<typeof stripeWebhookAckSchema>;
