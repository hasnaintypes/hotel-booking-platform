import { Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from "@nestjs/common";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { AnalyticsService } from "./analytics.service";

@Controller("api/business-insights")
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get("rollups")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  findRollups(@Query("limit") limit?: string) {
    return this.analyticsService.findRollups(limit);
  }

  @Post("rollups")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  createRollup() {
    return this.analyticsService.createRollup();
  }
}
