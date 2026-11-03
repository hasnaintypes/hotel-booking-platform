import { Controller, Get, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { HealthService } from "./health.service";

@Controller("system")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class AdminSystemController {
  constructor(private readonly healthService: HealthService) {}

  @Get("health")
  async health(@Res({ passthrough: true }) res: Response) {
    const details = await this.healthService.details();
    res.status(details.status === "healthy" ? 200 : 503);
    return details;
  }
}
