import { Controller, Get } from "@nestjs/common";

/**
 * Reserved audience for agency and API-key access (M6). This route only advertises that the
 * audience exists; partner credentials and resources are added when that milestone starts.
 */
@Controller("capabilities")
export class PartnerCapabilitiesController {
  @Get()
  capabilities() {
    return { audience: "partner", available: false };
  }
}
