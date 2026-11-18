import { Body, Controller, Get, HttpCode, HttpStatus, Patch, UseGuards } from "@nestjs/common";
import { ZodResponse } from "nestjs-zod";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { AuthenticatedUser } from "../../common/types/jwt-payload.interface";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { PublicUserDto } from "./dto/user-response.dto";
import { UsersService } from "./users.service";

@Controller("me")
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ZodResponse({ type: PublicUserDto, status: 200, description: "The signed-in account" })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.me(user.userId);
  }

  @Patch()
  @HttpCode(HttpStatus.OK)
  @ZodResponse({ type: PublicUserDto, status: 200, description: "The updated account" })
  update(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.userId, dto);
  }
}
