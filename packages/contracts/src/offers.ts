import { z } from "zod";
import { isoDateSchema, isoDateTimeInputSchema, isoDateTimeSchema, uuidSchema } from "./primitives";

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

export const BOARD_BASIS_VALUES = [
  "room_only",
  "breakfast",
  "half_board",
  "full_board",
  "all_inclusive",
] as const;

export const boardBasisSchema = z.enum(BOARD_BASIS_VALUES);

/**
 * The cancellation penalty frozen with an offer. Declared here rather than imported from
 * `@hotel-booking/pricing` because this package depends only on Zod; the API asserts the two types
 * stay compatible at compile time.
 */
export type CancellationPenalty =
  { type: "percent"; percent: number } | { type: "nights"; nights: number } | { type: "full" };

export type CancellationPolicy = {
  version: 1;
  source: "managed" | "supplier";
  freeCancelHoursBeforeArrival: number | null;
  penalty: CancellationPenalty;
  rawText?: string;
};

export const cancellationPenaltySchema: z.ZodType<CancellationPenalty> = z.union([
  z.object({ type: z.literal("percent"), percent: z.number() }),
  z.object({ type: z.literal("nights"), nights: z.number() }),
  z.object({ type: z.literal("full") }),
]);

export const cancellationPolicySchema = z.object({
  version: z.literal(1),
  source: z.enum(["managed", "supplier"]),
  freeCancelHoursBeforeArrival: z.number().nullable(),
  penalty: cancellationPenaltySchema,
  rawText: z.string().optional(),
});

export const offerRateOptionSchema = z.object({
  id: z.string(),
  boardBasis: boardBasisSchema,
  totalMinor: z.number().int(),
  totalCost: z.number(),
  currency: z.string(),
});

/** `POST /api/v1/offers`; a frozen provider quote. */
export const offerSchema = z.object({
  id: uuidSchema,
  source: z.enum(["managed", "supplier"]),
  hotelId: uuidSchema,
  checkIn: isoDateSchema,
  checkOut: isoDateSchema,
  adultCount: z.number().int(),
  childCount: z.number().int(),
  totalMinor: z.number().int(),
  totalCost: z.number(),
  currency: z.string(),
  cancellationPolicy: cancellationPolicySchema,
  rateOptions: z.array(offerRateOptionSchema),
  expiresAt: isoDateTimeSchema,
});

export type Offer = z.infer<typeof offerSchema>;
export type OfferRateOption = z.infer<typeof offerRateOptionSchema>;
