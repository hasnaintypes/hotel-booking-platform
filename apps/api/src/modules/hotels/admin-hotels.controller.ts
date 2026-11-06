import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  UseGuards,
} from "@nestjs/common";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { UuidPipe } from "../../common/pipes/uuid.pipe";
import { ToggleActiveDto } from "./dto/toggle-active.dto";
import { HotelsService } from "./hotels.service";

@Controller("hotels")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class AdminHotelsController {
  constructor(private readonly hotelsService: HotelsService) {}

  @Get()
  findAll() {
    return this.hotelsService.findAllAdmin();
  }

  @Get(":id")
  findOne(@Param("id", UuidPipe) id: string) {
    return this.hotelsService.findOneAdmin(id);
  }

  @Patch(":id")
  @HttpCode(HttpStatus.OK)
  setActive(@Param("id", UuidPipe) id: string, @Body() dto: ToggleActiveDto) {
    return this.hotelsService.setActive(id, dto);
  }
}
