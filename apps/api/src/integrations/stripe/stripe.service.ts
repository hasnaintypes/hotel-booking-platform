import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";

@Injectable()
export class StripeService {
  readonly client: Stripe;

  constructor(config: ConfigService) {
    this.client = new Stripe(config.get<string>("stripe.apiKey"));
  }
}
