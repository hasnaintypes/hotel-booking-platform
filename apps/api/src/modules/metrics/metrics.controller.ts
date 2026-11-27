import {
  Controller,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Res,
  UnauthorizedException,
  VERSION_NEUTRAL,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiResponse } from "@nestjs/swagger";
import type { Response } from "express";
import { MetricsService } from "../../common/metrics/metrics.service";
import type { JobQueue } from "../../domain/jobs/job-queue";
import { JOB_QUEUE } from "../jobs/job-queue.settings";

/**
 * Prometheus scrape endpoint, outside `/api/v1` so it is not part of the public API contract.
 * Outside production it is open for local scraping. In production it is disabled unless
 * `METRICS_TOKEN` is set, and then requires `Authorization: Bearer <token>`.
 */
@Controller({ path: "metrics", version: VERSION_NEUTRAL })
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly config: ConfigService,
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
  ) {}

  @Get()
  @ApiResponse({
    status: 200,
    description: "Prometheus text exposition format (text/plain; version=0.0.4)",
  })
  @ApiResponse({ status: 401, description: "The metrics token is missing or wrong" })
  @ApiResponse({ status: 404, description: "Metrics are disabled in this environment" })
  async scrape(
    @Headers("authorization") authorization: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const isProduction = this.config.get<string>("nodeEnv") === "production";
    const token = this.config.get<string>("metrics.token");

    if (isProduction && !token) throw new NotFoundException("Not found");
    if (token && authorization !== `Bearer ${token}`) {
      throw new UnauthorizedException("A metrics token is required.");
    }

    // Queue depth only exists in the process that runs the worker; the API process would pay for a
    // database query that can only return zeros.
    if (this.config.get<boolean>("jobs.workerEnabled")) {
      await this.metrics.refreshQueueMetrics(this.jobs);
    }

    const { body, contentType } = await this.metrics.render();
    res.type(contentType).send(body);
  }
}
