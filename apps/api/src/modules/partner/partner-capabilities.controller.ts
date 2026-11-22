import { Controller, Get } from "@nestjs/common";
import { ZodResponse } from "nestjs-zod";
import { PartnerCapabilitiesDto } from "./dto/partner-capabilities.dto";

/**
 * Reserved audience for agency and API-key access (M6). This route only advertises that the
 * audience exists; partner credentials and resources are added when that milestone starts.
 */
@Controller("capabilities")
export class PartnerCapabilitiesController {
  @Get()
  @ZodResponse({
    type: PartnerCapabilitiesDto,
    status: 200,
    description: "The partner audience exists but has no resources yet",
  })
  capabilities() {
    return { audience: "partner" as const, available: false as const };
  }
}
