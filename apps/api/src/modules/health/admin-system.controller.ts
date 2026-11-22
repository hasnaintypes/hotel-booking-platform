import { Controller, Get, Inject, Res, UseGuards } from "@nestjs/common";
import { ApiResponse } from "@nestjs/swagger";
import type { Response } from "express";
import { ZodResponse } from "nestjs-zod";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import type { JobQueue } from "../../domain/jobs/job-queue";
import { JOB_QUEUE } from "../jobs/job-queue.settings";
import { JobQueueMetricsDto, SystemHealthDto } from "./dto/health-response.dto";
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
  @ZodResponse({
    type: SystemHealthDto,
    status: 200,
    description: "The API is healthy, with process and dependency details",
  })
  @ApiResponse({
    status: 503,
    type: SystemHealthDto.Output,
    description: "The API is unhealthy; the body has the same shape",
  })
  async health(@Res({ passthrough: true }) res: Response) {
    const details = await this.healthService.details();
    res.status(details.status === "healthy" ? 200 : 503);
    return details;
  }

  @Get("jobs")
  @ZodResponse({
    type: JobQueueMetricsDto,
    status: 200,
    description: "Queue and outbox metrics for the job runner",
  })
  jobsMetrics() {
    return this.jobs.metrics();
  }
}
