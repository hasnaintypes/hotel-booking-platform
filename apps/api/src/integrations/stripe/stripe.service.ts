import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";

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

@Injectable()
export class StripeService {
  readonly client: Stripe;

  constructor(config: ConfigService) {
    this.client = new Stripe(
      config.get<string>("stripe.apiKey"),
      stripeClientOptions(config.get<string>("stripe.apiBase")),
    );
  }
}
