import { Module } from "@nestjs/common";
import { BusinessInsightsService } from "./business-insights.service";

@Module({
  providers: [BusinessInsightsService],
  exports: [BusinessInsightsService],
})
export class BusinessInsightsModule {}
