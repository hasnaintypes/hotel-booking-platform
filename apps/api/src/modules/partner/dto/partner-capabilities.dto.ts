import { createZodDto } from "nestjs-zod";
import { partnerCapabilitiesSchema } from "@hotel-booking/contracts";

/** `GET /api/v1/partner/capabilities`. */
export class PartnerCapabilitiesDto extends createZodDto(partnerCapabilitiesSchema) {}
