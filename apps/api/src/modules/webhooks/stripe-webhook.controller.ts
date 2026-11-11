import {
  Controller,
  Headers,
  HttpCode,
  Post,
  RawBodyRequest,
  Req,
  VERSION_NEUTRAL,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { Request } from "express";
import { StripeWebhookService } from "./stripe-webhook.service";

/**
 * `POST /webhooks/stripe` — unversioned and outside the `/api` prefix, matching the URL
 * registered in the Stripe dashboard. Signature verification is the only authentication: the
 * request never trusts the body until the signature over the raw bytes is valid.
 */
@Controller({ path: "webhooks/stripe", version: VERSION_NEUTRAL })
@SkipThrottle()
export class StripeWebhookController {
  constructor(private readonly webhooks: StripeWebhookService) {}

  @Post()
  @HttpCode(200)
  async receive(
    @Req() request: RawBodyRequest<Request>,
    @Headers("stripe-signature") signature?: string,
  ) {
    const outcome = await this.webhooks.handle(request.rawBody, signature);
    return { received: true, duplicate: outcome === "duplicate" };
  }
}
