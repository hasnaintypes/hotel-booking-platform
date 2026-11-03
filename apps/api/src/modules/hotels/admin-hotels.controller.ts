import { Body, Controller, HttpCode, HttpStatus, Param, Patch, UseGuards } from "@nestjs/common";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { MongoIdPipe } from "../../common/pipes/mongo-id.pipe";
import { ToggleActiveDto } from "./dto/toggle-active.dto";
import { HotelsService } from "./hotels.service";

@Controller("hotels")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class AdminHotelsController {
  constructor(private readonly hotelsService: HotelsService) {}

  @Patch(":id")
  @HttpCode(HttpStatus.OK)
  setActive(@Param("id", MongoIdPipe) id: string, @Body() dto: ToggleActiveDto) {
    return this.hotelsService.setActive(id, dto);
  }
}
