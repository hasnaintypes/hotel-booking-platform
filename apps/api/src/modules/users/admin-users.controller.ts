import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ZodResponse } from "nestjs-zod";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { UuidPipe } from "../../common/pipes/uuid.pipe";
import { AuthenticatedUser } from "../../common/types/jwt-payload.interface";
import { AdminUserListQueryDto } from "./dto/list-users-query.dto";
import { UpdateRoleDto } from "./dto/update-role.dto";
import { AdminUserPageDto, PublicUserDto } from "./dto/user-response.dto";
import { UsersService } from "./users.service";

@Controller("users")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ZodResponse({ type: AdminUserPageDto, status: 200, description: "One page of user accounts" })
  findAll(@Query() query: AdminUserListQueryDto) {
    return this.usersService.findAll(query);
  }

  @Patch(":id")
  @HttpCode(HttpStatus.OK)
  @ZodResponse({ type: PublicUserDto, status: 200, description: "The updated account" })
  updateRole(
    @Param("id", UuidPipe) id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.updateRole(id, dto, user.userId);
  }
}
