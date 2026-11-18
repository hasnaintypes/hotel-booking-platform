import { z } from "zod";
import { cursorPageSchema } from "./pagination";
import { isoDateTimeSchema, uuidSchema } from "./primitives";

/** Every difference the reconciler can record between local state and the provider. */
export const DISCREPANCY_KIND_VALUES = [
  "payment_status_mismatch",
  "payment_amount_mismatch",
  "refund_mismatch",
  "local_without_provider",
  "provider_missing",
  "provider_without_local",
  "ledger_mismatch",
] as const;

export const DISCREPANCY_STATUS_VALUES = ["open", "resolved", "ignored"] as const;

export const discrepancyKindSchema = z.enum(DISCREPANCY_KIND_VALUES);
export const discrepancyStatusSchema = z.enum(DISCREPANCY_STATUS_VALUES);

/** One stored finding as the admin queue returns it; nullable columns are present as `null`. */
export const discrepancySchema = z.object({
  id: uuidSchema,
  dedupeKey: z.string(),
  kind: discrepancyKindSchema,
  status: discrepancyStatusSchema,
  provider: z.string(),
  bookingId: uuidSchema.nullable(),
  paymentId: uuidSchema.nullable(),
  providerReference: z.string().nullable(),
  details: z.record(z.string(), z.unknown()),
  detectedAt: isoDateTimeSchema,
  resolvedAt: isoDateTimeSchema.nullable(),
  resolution: z.string().nullable(),
  assignedToUserId: uuidSchema.nullable(),
  assignedAt: isoDateTimeSchema.nullable(),
  assignedByUserId: uuidSchema.nullable(),
  resolvedByUserId: uuidSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const discrepancyPageSchema = cursorPageSchema(discrepancySchema);

export type DiscrepancyKind = (typeof DISCREPANCY_KIND_VALUES)[number];
export type DiscrepancyStatus = (typeof DISCREPANCY_STATUS_VALUES)[number];
export type Discrepancy = z.infer<typeof discrepancySchema>;
export type DiscrepancyPage = z.infer<typeof discrepancyPageSchema>;
