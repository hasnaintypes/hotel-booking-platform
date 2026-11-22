import { createZodDto } from "nestjs-zod";
import { stripeWebhookAckSchema } from "@hotel-booking/contracts";

/** `POST /webhooks/stripe`. */
export class StripeWebhookAckDto extends createZodDto(stripeWebhookAckSchema) {}
