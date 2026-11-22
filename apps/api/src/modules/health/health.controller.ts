import { Controller, Get, Res, VERSION_NEUTRAL } from "@nestjs/common";
import { ApiResponse } from "@nestjs/swagger";
import type { HealthStatus, Readiness } from "@hotel-booking/contracts";
import type { Response } from "express";
import { ZodResponse } from "nestjs-zod";
import { HealthStatusDto, ReadinessDto } from "./dto/health-response.dto";
import { HealthService } from "./health.service";

@Controller({ path: "health", version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get("live")
  @ZodResponse({
    type: HealthStatusDto,
    status: 200,
    description: "The process is running; the database is not checked",
  })
  live(): HealthStatus {
    return { status: "ok" as const, timestamp: new Date().toISOString() };
  }

  @Get("ready")
  @ZodResponse({
    type: ReadinessDto,
    status: 200,
    description: "PostgreSQL and migrations are ready, with the component checks spread flat",
  })
  @ApiResponse({
    status: 503,
    type: ReadinessDto.Output,
    description: "PostgreSQL or migrations are not ready; the body has the same shape",
  })
  async ready(@Res({ passthrough: true }) res: Response): Promise<Readiness> {
    const readiness = await this.healthService.readiness();
    res.status(readiness.ready ? 200 : 503);
    return {
      status: readiness.ready ? ("ready" as const) : ("not_ready" as const),
      timestamp: new Date().toISOString(),
      ...readiness.checks,
    };
  }
}
