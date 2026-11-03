import { Controller, Get, Res, VERSION_NEUTRAL } from "@nestjs/common";
import type { Response } from "express";
import { HealthService } from "./health.service";

@Controller({ path: "health", version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get("live")
  live() {
    return { status: "ok", timestamp: new Date().toISOString() };
  }

  @Get("ready")
  async ready(@Res({ passthrough: true }) res: Response) {
    const readiness = await this.healthService.readiness();
    res.status(readiness.ready ? 200 : 503);
    return {
      status: readiness.ready ? "ready" : "not_ready",
      timestamp: new Date().toISOString(),
      ...readiness.checks,
    };
  }
}
