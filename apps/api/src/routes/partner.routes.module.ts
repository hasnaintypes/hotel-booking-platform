import { Module } from "@nestjs/common";
import { PartnerCapabilitiesController } from "../modules/partner/partner-capabilities.controller";

/** `/api/v1/partner` — reserved for agency and API-key access (M6). */
@Module({
  controllers: [PartnerCapabilitiesController],
})
export class PartnerRoutesModule {}
