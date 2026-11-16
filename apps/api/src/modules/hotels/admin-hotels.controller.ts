import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiHeader, ApiResponse } from "@nestjs/swagger";
import type { Request } from "express";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { ResponseEtag } from "../../common/http/response-etag.decorator";
import { UuidPipe } from "../../common/pipes/uuid.pipe";
import { ToggleActiveDto } from "./dto/toggle-active.dto";
import { AdminHotelListQueryDto } from "./dto/hotel.dto";
import { HotelsService } from "./hotels.service";

@Controller("hotels")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class AdminHotelsController {
  constructor(private readonly hotelsService: HotelsService) {}

  @Get()
  findAll(@Query() query: AdminHotelListQueryDto) {
    return this.hotelsService.findAllAdmin(query);
  }

  @Get(":id")
  @ResponseEtag()
  findOne(@Param("id", UuidPipe) id: string) {
    return this.hotelsService.findOneAdmin(id);
  }

  /**
   * `If-Match` is optional today and enforced when sent: a client that read the hotel receives an
   * `ETag` from `GET /admin/hotels/:id` and can make the toggle conditional, while existing callers
   * keep working until every client sends it.
   */
  @Patch(":id")
  @HttpCode(HttpStatus.OK)
  @ApiHeader({
    name: "If-Match",
    required: false,
    description: "ETag from GET /api/v1/admin/hotels/:id; a stale value returns 412.",
  })
  @ApiResponse({ status: 200, description: "The hotel with its updated state" })
  @ApiResponse({ status: 412, description: "If-Match does not match the current representation" })
  setActive(
    @Param("id", UuidPipe) id: string,
    @Body() dto: ToggleActiveDto,
    @Req() request: Request,
  ) {
    const header = request.headers["if-match"];
    const ifMatch = Array.isArray(header) ? header[0] : header;
    return this.hotelsService.setActive(id, dto, { ifMatch });
  }
}
