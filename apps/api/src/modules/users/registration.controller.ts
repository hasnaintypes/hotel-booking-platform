import { Body, Controller, HttpCode, HttpStatus, Post, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Response } from "express";
import { SESSION_COOKIE_NAME, authCookieOptions } from "../../common/auth-cookie";
import { authRateLimit } from "../../common/security/auth-rate-limit";
import { RegisterDto } from "./dto/register.dto";
import { UsersService } from "./users.service";

@Controller("auth")
export class RegistrationController {
  constructor(private readonly usersService: UsersService) {}

  @Post("register")
  @Throttle(authRateLimit)
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const { token, user } = await this.usersService.register(dto);
    res.cookie(SESSION_COOKIE_NAME, token, authCookieOptions());
    res.setHeader("Location", "/api/v1/me");
    return user;
  }
}
