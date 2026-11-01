import { Controller, Get, UseGuards } from "@nestjs/common";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { BusinessInsightsService } from "./business-insights.service";

/**
 * Platform revenue and usage figures. Admin only: there are no public variants. Errors are left to
 * the global exception filter, which never echoes internal messages.
 */
@Controller("api/business-insights")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class BusinessInsightsController {
  constructor(private readonly businessInsightsService: BusinessInsightsService) {}

  @Get("dashboard")
  dashboard() {
    return this.businessInsightsService.getDashboardData();
  }

  @Get("forecast")
  forecast() {
    return this.businessInsightsService.getForecastData();
  }

  @Get("system-stats")
  systemStats() {
    return this.businessInsightsService.getSystemStatsData();
  }
}
