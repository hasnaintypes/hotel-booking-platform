import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { ApiParam } from "@nestjs/swagger";
import { ZodResponse } from "nestjs-zod";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { OptionalJwtAuthGuard } from "../../common/guards/optional-jwt-auth.guard";
import { UuidPipe } from "../../common/pipes/uuid.pipe";
import { AuthenticatedUser } from "../../common/types/jwt-payload.interface";
import {
  HotelSearchQueryDto,
  PublicHotelDto,
  PublicHotelListQueryDto,
  PublicHotelPageDto,
} from "./dto/hotel.dto";
import { HotelsService } from "./hotels.service";

@Controller("hotels")
export class HotelsController {
  constructor(private readonly hotelsService: HotelsService) {}

  @Get("search")
  @ZodResponse({
    type: PublicHotelPageDto,
    status: 200,
    description: "Active hotels matching the filters",
  })
  search(@Query() query: HotelSearchQueryDto) {
    return this.hotelsService.search(query);
  }

  @Get()
  @ZodResponse({
    type: PublicHotelPageDto,
    status: 200,
    description: "One page of active hotels, newest first",
  })
  findAll(@Query() query: PublicHotelListQueryDto) {
    return this.hotelsService.findAll(query);
  }

  @Get(":id")
  @UseGuards(OptionalJwtAuthGuard)
  @ApiParam({ name: "id", format: "uuid", description: "Hotel id" })
  @ZodResponse({ type: PublicHotelDto, status: 200, description: "One active hotel" })
  findOne(@Param("id", UuidPipe) id: string, @CurrentUser() viewer: AuthenticatedUser | undefined) {
    return this.hotelsService.findOne(id, viewer);
  }
}
