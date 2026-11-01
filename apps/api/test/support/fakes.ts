import { vi } from "vitest";

/** Stripe stand-in: no network, programmable per test. */
export function createFakeStripe() {
  const client = {
    paymentIntents: {
      create: vi.fn(async (params: { amount: number; metadata?: Record<string, string> }) => ({
        id: `pi_test_${Math.random().toString(36).slice(2, 10)}`,
        client_secret: "pi_secret_test",
        amount: params.amount,
        metadata: params.metadata ?? {},
        status: "requires_payment_method",
      })),
      retrieve: vi.fn(),
    },
    refunds: {
      create: vi.fn(async (params: { payment_intent: string }) => ({
        id: "re_test",
        amount: 0,
        payment_intent: params.payment_intent,
        status: "succeeded",
      })),
    },
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
