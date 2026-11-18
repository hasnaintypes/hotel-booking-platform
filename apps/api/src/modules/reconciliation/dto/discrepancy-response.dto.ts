import { createZodDto } from "nestjs-zod";
import { discrepancyPageSchema, discrepancySchema } from "@hotel-booking/contracts";

/** `GET /api/v1/admin/reconciliation/discrepancies`. */
export class DiscrepancyPageDto extends createZodDto(discrepancyPageSchema) {}

/** One finding, as list and update return it. */
export class DiscrepancyDto extends createZodDto(discrepancySchema) {}
