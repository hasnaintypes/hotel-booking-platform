import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { AuthenticatedUser } from "../../common/types/jwt-payload.interface";
import { AuthService } from "./auth.service";
import { clearAuthCookieOptions } from "./cookie.config";
import { LoginDto } from "./dto/login.dto";

@Controller("api/auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get("google")
  google(@Res() res: Response) {
    res.redirect(this.authService.buildGoogleAuthUrl());
  }

  @Get("callback/google")
  async googleCallback(
    @Query("code") code: string | undefined,
    @Query("error") error: string | undefined,
    @Res() res: Response,
  ) {
    const url = await this.authService.handleGoogleCallback(
      code ? String(code) : undefined,
      error ? String(error) : undefined,
    );
    res.redirect(url);
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get("validate-token")
  @UseGuards(JwtAuthGuard)
  validateToken(@CurrentUser() user: AuthenticatedUser) {
    return { userId: user.userId };
  }

  @Post("logout")
  logout(@Res() res: Response) {
    res.cookie("session_id", "", {
      ...clearAuthCookieOptions(),
      maxAge: 0,
    });
    res.cookie("auth_token", "", {
      ...clearAuthCookieOptions(),
      maxAge: 0,
    });
    res.send();
  }
}
