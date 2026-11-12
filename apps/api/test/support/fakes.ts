import { vi } from "vitest";
import Stripe from "stripe";

/** Stripe stand-in: no network, programmable per test. Signature verification uses the real SDK. */
export function createFakeStripe() {
  const verifier = new Stripe("sk_test_webhook_verifier");
  const client = {
    paymentIntents: {
      create: vi.fn(
        async (
          params: {
            amount: number;
            capture_method?: "automatic" | "manual";
            metadata?: Record<string, string>;
          },
          _options?: { idempotencyKey?: string },
        ) => ({
          id: `pi_test_${Math.random().toString(36).slice(2, 10)}`,
          client_secret: "pi_secret_test",
          amount: params.amount,
          amount_received: 0,
          capture_method: params.capture_method ?? "automatic",
          metadata: params.metadata ?? {},
          status: "requires_payment_method",
        }),
      ),
      retrieve: vi.fn(async (id: string) => ({
        id,
        amount: 0,
        amount_received: 0,
        metadata: {} as Record<string, string>,
        latest_charge: null as Record<string, unknown> | null,
        status: "requires_payment_method",
      })),
      list: vi.fn(async () => ({
        data: [] as Record<string, unknown>[],
        has_more: false,
      })),
      cancel: vi.fn(async (id: string) => ({
        id,
        amount: 0,
        amount_received: 0,
        metadata: {},
        status: "canceled",
      })),
      capture: vi.fn(async (id: string, params?: { amount_to_capture?: number }) => ({
        id,
        amount_received: params?.amount_to_capture ?? 0,
        status: "succeeded",
      })),
    },
    refunds: {
      create: vi.fn(
        async (
          params: { payment_intent: string; amount?: number },
          _options?: { idempotencyKey?: string },
        ) => ({
          id: `re_test_${Math.random().toString(36).slice(2, 10)}`,
          amount: params.amount ?? 0,
          payment_intent: params.payment_intent,
          status: "succeeded",
        }),
      ),
      retrieve: vi.fn(async (id: string) => ({
        id,
        amount: 0,
        payment_intent: "pi_test",
        status: "succeeded",
      })),
    },
    webhooks: verifier.webhooks,
  };
  return { client };
}

export function createFakeCloudinary() {
  return {
    uploadImages: vi.fn(async (files: unknown[]) =>
      (files ?? []).map((_, i) => ({
        url: `https://res.cloudinary.test/image-${i}.jpg`,
        publicId: `hotel-booking/test/image-${i}`,
      })),
    ),
    deleteImages: vi.fn(async (_publicIds: string[]) => {}),
  };
}
