import { Controller, Get, Inject, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import type { JobQueue } from "../../domain/jobs/job-queue";
import { JOB_QUEUE } from "../jobs/job-queue.settings";
import { HealthService } from "./health.service";

@Controller("system")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class AdminSystemController {
  constructor(
    private readonly healthService: HealthService,
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
  ) {}

  @Get("health")
  async health(@Res({ passthrough: true }) res: Response) {
    const details = await this.healthService.details();
    res.status(details.status === "healthy" ? 200 : 503);
    return details;
  }

  @Get("jobs")
  jobsMetrics() {
    return this.jobs.metrics();
  }
}
