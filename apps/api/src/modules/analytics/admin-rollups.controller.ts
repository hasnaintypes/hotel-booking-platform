import { Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from "@nestjs/common";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { AnalyticsService } from "./analytics.service";
import { RollupListQueryDto } from "./dto/list-rollups-query.dto";

@Controller("reports")
export class AdminRollupsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get("rollups")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  findRollups(@Query() query: RollupListQueryDto) {
    return this.analyticsService.findRollups(query);
  }

  @Post("rollups")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  createRollup() {
    return this.analyticsService.createRollup();
  }
}
