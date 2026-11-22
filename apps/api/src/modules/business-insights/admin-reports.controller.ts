import { Controller, Get, UseGuards } from "@nestjs/common";
import { ZodResponse } from "nestjs-zod";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { BusinessInsightsService } from "./business-insights.service";
import { ForecastReportDto, ReportsOverviewDto, SystemStatsDto } from "./dto/reports-response.dto";

/**
 * Platform revenue and usage figures. Admin only: there are no public variants. Errors are left to
 * the global exception filter, which never echoes internal messages.
 */
@Controller("reports")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class AdminReportsController {
  constructor(private readonly businessInsightsService: BusinessInsightsService) {}

  @Get("overview")
  @ZodResponse({
    type: ReportsOverviewDto,
    status: 200,
    description: "Live dashboard totals, breakdowns and review averages",
  })
  dashboard() {
    return this.businessInsightsService.getDashboardData();
  }

  @Get("forecast")
  @ZodResponse({
    type: ForecastReportDto,
    status: 200,
    description: "Weekly history plus a four-week booking and revenue forecast",
  })
  forecast() {
    return this.businessInsightsService.getForecastData();
  }

  @Get("system-stats")
  @ZodResponse({
    type: SystemStatsDto,
    status: 200,
    description: "Measured database, application and process figures",
  })
  systemStats() {
    return this.businessInsightsService.getSystemStatsData();
  }
}
