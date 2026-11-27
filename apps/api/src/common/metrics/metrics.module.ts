import { Global, Module } from "@nestjs/common";
import { MetricsService } from "./metrics.service";

/** One registry per process, available to the HTTP pipeline, the error filter and integrations. */
@Global()
@Module({
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
