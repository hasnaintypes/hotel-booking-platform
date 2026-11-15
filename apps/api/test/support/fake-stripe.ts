import { vi } from "vitest";
import Stripe from "stripe";

/**
 * Stripe stand-in for the resilience kit: no network, but it keeps provider-side state and honours
 * idempotency keys, so a test can prove that a retried capture or create moved money exactly once.
 *
 * The provider object is deliberately separate from the client. A test that models a killed worker
 * boots a second application against the *same* provider, which is what makes "the retry replayed
 * the provider request" observable.
 */

export type StripeErrorKind = "api" | "connection" | "card" | "rate_limit";

const ERROR_SHAPES: Record<StripeErrorKind, Record<string, unknown>> = {
  // A 5xx from Stripe: the request reached the provider and the outcome is unknown locally.
  api: {
    type: "StripeAPIError",
    statusCode: 500,
    code: "api_error",
    message: "An unknown error occurred",
  },
  // The connection dropped before or after the request; the SDK cannot say which.
  connection: {
    type: "StripeConnectionError",
    message: "An error occurred with our connection to Stripe.",
  },
  card: {
    type: "StripeCardError",
    statusCode: 402,
    code: "card_declined",
    message: "Your card was declined.",
  },
  rate_limit: {
    type: "StripeRateLimitError",
    statusCode: 429,
    message: "Too many requests hit the API too quickly.",
  },
};

/** Builds an error shaped like the one the real SDK throws for `kind`. */
export function stripeError(
  kind: StripeErrorKind,
  overrides: { code?: string; message?: string } = {},
): Error & Record<string, unknown> {
  return Object.assign(new Error(overrides.message ?? "stripe failure"), ERROR_SHAPES[kind], {
    ...overrides,
  }) as Error & Record<string, unknown>;
}

type IntentState = {
  id: string;
  amount: number;
  amountReceived: number;
  amountCapturable: number;
  status: string;
  metadata: Record<string, string>;
  captureMethod: "automatic" | "manual";
};

export type ProviderCapture = { intentId: string; amountMinor: number; idempotencyKey?: string };
export type ProviderRefund = { intentId: string; amountMinor: number; idempotencyKey?: string };

/** The provider account a fake client talks to. Survives an application restart. */
export type FakeStripeProvider = {
  intents: Map<string, IntentState>;
  /** Money that actually moved at the provider, in call order. A replay does not append. */
  captures: ProviderCapture[];
  refunds: ProviderRefund[];
  cancellations: string[];
  /** Responses keyed by `Idempotency-Key`, exactly as the real API replays them. */
  idempotency: Map<string, unknown>;
  /** Monotonic provider id sequence; never reset, so ids cannot collide across tests. */
  sequence: number;
};

export function createFakeStripeProvider(): FakeStripeProvider {
  return {
    intents: new Map(),
    captures: [],
    refunds: [],
    cancellations: [],
    idempotency: new Map(),
    sequence: 0,
  };
}

/**
 * Registers an intent the provider already holds, such as one a fixture inserted straight into
 * PostgreSQL. Without it a capture of that intent has no amount to report.
 */
export function seedFakeIntent(
  provider: FakeStripeProvider,
  input: {
    id: string;
    amountMinor: number;
    status?: string;
    metadata?: Record<string, string>;
    captureMethod?: "automatic" | "manual";
  },
): void {
  provider.intents.set(input.id, {
    id: input.id,
    amount: input.amountMinor,
    amountReceived: 0,
    amountCapturable: input.amountMinor,
    status: input.status ?? "requires_capture",
    metadata: input.metadata ?? {},
    captureMethod: input.captureMethod ?? "manual",
  });
}

/** Returns the stored response for a repeated key instead of performing the effect again. */
function replay<T>(provider: FakeStripeProvider, key: string | undefined, produce: () => T): T {
  if (!key) return produce();
  if (provider.idempotency.has(key)) return provider.idempotency.get(key) as T;
  const result = produce();
  provider.idempotency.set(key, result);
  return result;
}

export type FakeStripe = ReturnType<typeof createFakeStripe>;

/** Stripe stand-in: no network, programmable per test. Signature verification uses the real SDK. */
export function createFakeStripe(provider: FakeStripeProvider = createFakeStripeProvider()) {
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
          options?: { idempotencyKey?: string },
        ) =>
          replay(provider, options?.idempotencyKey, () => {
            provider.sequence += 1;
            const state: IntentState = {
              id: `pi_test_${provider.sequence}`,
              amount: params.amount,
              amountReceived: 0,
              amountCapturable: 0,
              status: "requires_payment_method",
              metadata: params.metadata ?? {},
              captureMethod: params.capture_method ?? "automatic",
            };
            provider.intents.set(state.id, state);
            return {
              id: state.id,
              client_secret: "pi_secret_test",
              amount: state.amount,
              amount_received: 0,
              amount_capturable: 0,
              capture_method: state.captureMethod,
              metadata: state.metadata,
              status: state.status,
            };
          }),
      ),
      retrieve: vi.fn(async (id: string) => {
        const state = provider.intents.get(id);
        return {
          id,
          amount: state?.amount ?? 0,
          amount_received: state?.amountReceived ?? 0,
          metadata: state?.metadata ?? ({} as Record<string, string>),
          latest_charge: null as Record<string, unknown> | null,
          status: state?.status ?? "requires_payment_method",
        };
      }),
      list: vi.fn(async () => ({
        data: [] as Record<string, unknown>[],
        has_more: false,
      })),
      cancel: vi.fn(async (id: string) => {
        const state = provider.intents.get(id);
        if (state) state.status = "canceled";
        provider.cancellations.push(id);
        return {
          id,
          amount: state?.amount ?? 0,
          amount_received: state?.amountReceived ?? 0,
          metadata: state?.metadata ?? {},
          status: "canceled",
        };
      }),
      capture: vi.fn(
        async (
          id: string,
          params?: { amount_to_capture?: number },
          options?: { idempotencyKey?: string },
        ) =>
          replay(provider, options?.idempotencyKey, () => {
            const state = provider.intents.get(id);
            const amountMinor = params?.amount_to_capture ?? state?.amount ?? 0;
            if (state) {
              state.status = "succeeded";
              state.amountReceived = amountMinor;
              state.amountCapturable = 0;
            }
            provider.captures.push({
              intentId: id,
              amountMinor,
              ...(options?.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
            });
            return { id, amount_received: amountMinor, status: "succeeded" };
          }),
      ),
    },
    refunds: {
      create: vi.fn(
        async (
          params: { payment_intent: string; amount?: number },
          options?: { idempotencyKey?: string },
        ) =>
          replay(provider, options?.idempotencyKey, () => {
            provider.sequence += 1;
            provider.refunds.push({
              intentId: params.payment_intent,
              amountMinor: params.amount ?? 0,
              ...(options?.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
            });
            return {
              id: `re_test_${provider.sequence}`,
              amount: params.amount ?? 0,
              payment_intent: params.payment_intent,
              status: "succeeded",
            };
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

  return { client, provider };
}

export type StripeOperation =
  | "paymentIntents.create"
  | "paymentIntents.retrieve"
  | "paymentIntents.cancel"
  | "paymentIntents.capture"
  | "refunds.create"
  | "refunds.retrieve";

const methodFor = (stripe: FakeStripe, operation: StripeOperation) => {
  const [resource, method] = operation.split(".") as [
    "paymentIntents" | "refunds",
    "create" | "retrieve" | "cancel" | "capture",
  ];
  return stripe.client[resource][method] as unknown as ReturnType<typeof vi.fn>;
};

/** Makes the next call to `operation` fail with `error`. */
export function failNextStripeCall(
  stripe: FakeStripe,
  operation: StripeOperation,
  error: Error,
): void {
  methodFor(stripe, operation).mockRejectedValueOnce(error);
}

/** Makes every call to `operation` fail with `error`, however often it is retried. */
export function failAlwaysStripeCall(
  stripe: FakeStripe,
  operation: StripeOperation,
  error: Error,
): void {
  methodFor(stripe, operation).mockRejectedValue(error);
}

/**
 * Models the provider completing the call and the process dying before it can read the answer:
 * the provider-side effect is applied by the real fake implementation, then the call never
 * settles, so no `catch`, `finally` or claim release runs. Await `entered` before killing the
 * process, because it resolves once the effect has happened.
 */
export function hangNextStripeCall(
  stripe: FakeStripe,
  operation: StripeOperation,
): { entered: Promise<void> } {
  const method = methodFor(stripe, operation);
  const original = method.getMockImplementation() as (...args: unknown[]) => Promise<unknown>;
  if (!original) throw new Error(`No base implementation registered for ${operation}`);

  let markEntered = () => {};
  const entered = new Promise<void>((resolve) => {
    markEntered = resolve;
  });

  method.mockImplementationOnce(async (...args: unknown[]) => {
    await original(...args);
    markEntered();
    // Never resolves: this call belongs to the process that is about to disappear.
    return new Promise<never>(() => {});
  });

  return { entered };
}
