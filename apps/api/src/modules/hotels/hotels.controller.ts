import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { OptionalJwtAuthGuard } from "../../common/guards/optional-jwt-auth.guard";
import { UuidPipe } from "../../common/pipes/uuid.pipe";
import { AuthenticatedUser } from "../../common/types/jwt-payload.interface";
import { SearchHotelsDto } from "./dto/search-hotels.dto";
import { HotelsService } from "./hotels.service";

@Controller("hotels")
export class HotelsController {
  constructor(private readonly hotelsService: HotelsService) {}

  @Get("search")
  search(@Query() query: SearchHotelsDto) {
    return this.hotelsService.search(query);
  }

  @Get()
  findAll() {
    return this.hotelsService.findAll();
  }

  @Get(":id")
  @UseGuards(OptionalJwtAuthGuard)
  findOne(@Param("id", UuidPipe) id: string, @CurrentUser() viewer: AuthenticatedUser | undefined) {
    return this.hotelsService.findOne(id, viewer);
  }
}
