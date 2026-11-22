import { Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from "@nestjs/common";
import { ZodResponse } from "nestjs-zod";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { AnalyticsService } from "./analytics.service";
import { RollupDto, RollupPageDto } from "./dto/rollup-response.dto";
import { RollupListQueryDto } from "./dto/list-rollups-query.dto";

@Controller("reports")
export class AdminRollupsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get("rollups")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @ZodResponse({
    type: RollupPageDto,
    status: 200,
    description: "One page of persisted business-insights snapshots, newest first",
  })
  findRollups(@Query() query: RollupListQueryDto) {
    return this.analyticsService.findRollups(query);
  }

  @Post("rollups")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @ZodResponse({
    type: RollupDto,
    status: 201,
    description: "The newly captured snapshot of the live business figures",
  })
  createRollup() {
    return this.analyticsService.createRollup();
  }
}
