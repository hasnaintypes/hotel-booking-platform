import { Controller, Get, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { AuthenticatedUser } from "../../common/types/jwt-payload.interface";
import { UsersService } from "./users.service";

@Controller("me")
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.me(user.userId);
  }
}
