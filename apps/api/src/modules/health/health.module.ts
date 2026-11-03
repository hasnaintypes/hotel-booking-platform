import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { HealthServiceModule } from "./health-service.module";

@Module({
  imports: [HealthServiceModule],
  controllers: [HealthController],
})
export class HealthModule {}
