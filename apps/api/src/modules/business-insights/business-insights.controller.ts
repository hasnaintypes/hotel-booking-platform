import { Controller, Get, InternalServerErrorException, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { BusinessInsightsService } from "./business-insights.service";

@Controller("api/business-insights")
export class BusinessInsightsController {
  constructor(private readonly businessInsightsService: BusinessInsightsService) {}

  @Get("dashboard/public")
  async publicDashboard() {
    try {
      return await this.businessInsightsService.getDashboardData();
    } catch (error) {
      throw new InternalServerErrorException({
        error: "Failed to fetch business insights data",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  @Get("dashboard")
  @UseGuards(JwtAuthGuard)
  async dashboard() {
    try {
      return await this.businessInsightsService.getDashboardData();
    } catch (error) {
      throw new InternalServerErrorException({
        error: "Failed to fetch business insights data",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  @Get("forecast/public")
  async publicForecast() {
    try {
      return await this.businessInsightsService.getForecastData();
    } catch (error) {
      throw new InternalServerErrorException({
        error: "Failed to generate forecasts",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  @Get("forecast")
  @UseGuards(JwtAuthGuard)
  async forecast() {
    try {
      return await this.businessInsightsService.getForecastData();
    } catch (error) {
      throw new InternalServerErrorException({
        error: "Failed to generate forecasts",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  @Get("system-stats/public")
  async publicSystemStats() {
    try {
      return await this.businessInsightsService.getBusinessStatsData();
    } catch (error) {
      throw new InternalServerErrorException({
        error: "Failed to fetch performance metrics",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  @Get("system-stats")
  @UseGuards(JwtAuthGuard)
  async systemStats() {
    try {
      return await this.businessInsightsService.getSystemStatsData();
    } catch (error) {
      throw new InternalServerErrorException({
        error: "Failed to fetch performance metrics",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
}
