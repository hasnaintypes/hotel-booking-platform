import { Module } from "@nestjs/common";
import { DatabaseRepositoriesModule } from "../../database/repositories/repositories.module";
import { HealthService } from "./health.service";

@Module({
  imports: [DatabaseRepositoriesModule],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthServiceModule {}
