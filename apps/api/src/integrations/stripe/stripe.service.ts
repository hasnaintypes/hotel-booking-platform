import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";
import { MetricsService } from "../../common/metrics/metrics.service";

/**
 * Maps the optional `STRIPE_API_BASE` override onto Stripe client options. The override exists
 * for the Playwright suite, which runs the SDK against a repo-local mock; `validateEnv` refuses it
 * in production, so a deployed API always talks to Stripe itself.
 */
export const stripeClientOptions = (apiBase: string | undefined): Stripe.StripeConfig => {
  if (!apiBase) return {};

  const url = new URL(apiBase);
  const protocol = url.protocol === "https:" ? "https" : "http";

  return {
    host: url.hostname,
    port: Number(url.port || (protocol === "https" ? 443 : 80)),
    protocol,
  };
};

/** Stripe error types collapsed into a small, low-cardinality outcome vocabulary. */
const STRIPE_OUTCOMES: Record<string, string> = {
  StripeCardError: "card_error",
  StripeConnectionError: "connection_error",
  StripeAPIError: "api_error",
  StripeRateLimitError: "rate_limit",
  StripeInvalidRequestError: "invalid_request",
  StripeAuthenticationError: "authentication_error",
  StripePermissionError: "permission_error",
  StripeIdempotencyError: "idempotency_error",
};

export function stripeOutcome(error: unknown): string {
  const type = (error as { type?: unknown } | null)?.type;
  return typeof type === "string" ? (STRIPE_OUTCOMES[type] ?? "error") : "error";
}

export type StripeCallRecorder = (operation: string, outcome: string, seconds: number) => void;

/**
 * Times one Stripe request and reports its outcome, whatever the caller does with the result or the
 * error. Shared with the test double so the tests exercise the same instrumentation.
 */
export async function runStripeCall<T>(
  operation: string,
  request: () => Promise<T>,
  record: StripeCallRecorder,
): Promise<T> {
  const startedAt = process.hrtime.bigint();
  try {
    const result = await request();
    record(operation, "success", Number(process.hrtime.bigint() - startedAt) / 1e9);
    return result;
  } catch (error) {
    record(operation, stripeOutcome(error), Number(process.hrtime.bigint() - startedAt) / 1e9);
    throw error;
  }
}

@Injectable()
export class StripeService {
  readonly client: Stripe;

  constructor(
    config: ConfigService,
    private readonly metrics: MetricsService,
  ) {
    this.client = new Stripe(
      config.get<string>("stripe.apiKey"),
      stripeClientOptions(config.get<string>("stripe.apiBase")),
    );
  }

  /**
   * Runs one Stripe request, recording its duration and outcome. Called inside the request or job
   * context, so the surrounding log line carries the originating request id.
   */
  async call<T>(operation: string, request: () => Promise<T>): Promise<T> {
    return runStripeCall(operation, request, (name, outcome, seconds) =>
      this.metrics.recordStripeCall(name, outcome, seconds),
    );
  }
}
