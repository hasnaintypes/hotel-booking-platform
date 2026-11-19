import { z } from "zod";
import { isoDateTimeInputSchema, uuidSchema } from "./primitives";

/**
 * `POST /api/v1/offers`: a quote request. The stay is described only; prices and policies always
 * come from a provider, never from the client.
 */
export const createOfferRequestSchema = z.object({
  hotelId: uuidSchema,
  adultCount: z.number().int().min(1).max(50),
  childCount: z.number().int().min(0).max(50),
  checkIn: isoDateTimeInputSchema,
  checkOut: isoDateTimeInputSchema,
});

export type CreateOfferRequest = z.infer<typeof createOfferRequestSchema>;
