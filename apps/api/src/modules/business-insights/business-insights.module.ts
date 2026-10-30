import { Module } from "@nestjs/common";
import { BusinessInsightsController } from "./business-insights.controller";
import { BusinessInsightsService } from "./business-insights.service";

@Module({
  controllers: [BusinessInsightsController],
  providers: [BusinessInsightsService],
})
export class BusinessInsightsModule {}
