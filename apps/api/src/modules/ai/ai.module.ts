import { Module } from "@nestjs/common";
import { AiController } from "./ai.controller";
import { AiService } from "./ai.service";
import { AiUsageLimiter } from "./ai-usage-limiter";

@Module({
  controllers: [AiController],
  providers: [AiService, AiUsageLimiter],
})
export class AiModule {}
