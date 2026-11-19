import { createZodDto } from "nestjs-zod";
import { createOfferRequestSchema } from "@hotel-booking/contracts";

/**
 * A quote request. The stay is described only; prices and policies always come from a provider,
 * never from the client.
 */
export class CreateOfferDto extends createZodDto(createOfferRequestSchema) {}
