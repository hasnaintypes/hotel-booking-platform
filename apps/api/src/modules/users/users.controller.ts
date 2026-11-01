import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Response } from "express";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { MongoIdPipe } from "../../common/pipes/mongo-id.pipe";
import { authRateLimit } from "../../common/security/auth-rate-limit";
import { AuthenticatedUser } from "../../common/types/jwt-payload.interface";
import { SESSION_COOKIE_NAME, authCookieOptions } from "../../common/auth-cookie";
import { RegisterDto } from "./dto/register.dto";
import { UpdateRoleDto } from "./dto/update-role.dto";
import { UsersService } from "./users.service";

@Controller("api/users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.me(user.userId);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  findAll() {
    return this.usersService.findAll();
  }

  @Patch(":id/role")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  updateRole(
    @Param("id", MongoIdPipe) id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.updateRole(id, dto, user.userId);
  }

  @Post("register")
  @Throttle(authRateLimit)
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const { token, user } = await this.usersService.register(dto);
    res.cookie(SESSION_COOKIE_NAME, token, authCookieOptions());
    res.setHeader("Location", "/api/users/me");
    return user;
  }
}
