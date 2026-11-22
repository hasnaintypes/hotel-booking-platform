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

/** A refund as `charge.refunded` reports it in `data.object.refunds.data`. */
const stripeRefundSchema = z.looseObject({
  id: z.string(),
  status: z.string(),
  amount: z.number(),
});

/**
 * The verified Stripe event stored in `inbox_events.payload`. Deliberately loose: it describes only
 * the fields the webhook handlers read, keeps every unknown field Stripe sends, and parses
 * unhandled event types so they can still be recorded and acknowledged.
 */
export const stripeWebhookEventSchema = z.looseObject({
  id: z.string(),
  type: z.string(),
  data: z.looseObject({
    object: z.looseObject({
      id: z.string(),
      amount: z.number().optional(),
      amount_received: z.number().optional(),
      amount_capturable: z.number().optional(),
      amount_refunded: z.number().optional(),
      currency: z.string().optional(),
      status: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).nullish(),
      last_payment_error: z
        .looseObject({
          code: z.string().optional(),
          message: z.string().optional(),
        })
        .nullish(),
      payment_intent: z.union([z.string(), z.looseObject({ id: z.string() })]).nullish(),
      refunds: z
        .looseObject({
          data: z.array(stripeRefundSchema).optional(),
        })
        .nullish(),
    }),
  }),
});

export type StripeWebhookEvent = z.infer<typeof stripeWebhookEventSchema>;
