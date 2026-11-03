import { Module } from "@nestjs/common";
import { AiService } from "./ai.service";
import { AiUsageLimiter } from "./ai-usage-limiter";

@Module({
  providers: [AiService, AiUsageLimiter],
  exports: [AiService],
})
export class AiModule {}
