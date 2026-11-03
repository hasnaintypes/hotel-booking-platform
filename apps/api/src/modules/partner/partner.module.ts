import { Module } from "@nestjs/common";
import { PartnerCapabilitiesController } from "./partner-capabilities.controller";

@Module({
  controllers: [PartnerCapabilitiesController],
})
export class PartnerModule {}
