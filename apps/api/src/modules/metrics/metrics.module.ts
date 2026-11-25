import { Module } from "@nestjs/common";
import { JobsModule } from "../jobs/jobs.module";
import { MetricsController } from "./metrics.controller";

/** The scrape route lives with the queue it reports on, not with the public API modules. */
@Module({
  imports: [JobsModule],
  controllers: [MetricsController],
})
export class MetricsFeatureModule {}
