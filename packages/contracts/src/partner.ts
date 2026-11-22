import { z } from "zod";

/**
 * `GET /api/v1/partner/capabilities`. Until M6 this only advertises that the partner audience
 * exists; both values are literals so a future change is a deliberate contract change.
 */
export const partnerCapabilitiesSchema = z.object({
  audience: z.literal("partner"),
  available: z.literal(false),
});

export type PartnerCapabilities = z.infer<typeof partnerCapabilitiesSchema>;
