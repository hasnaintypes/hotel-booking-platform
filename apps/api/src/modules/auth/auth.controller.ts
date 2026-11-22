import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, Res } from "@nestjs/common";
import { ApiResponse } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Request, Response } from "express";
import { ZodResponse } from "nestjs-zod";
import {
  OAUTH_STATE_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  authCookieOptions,
  clearAuthCookieOptions,
  clearOauthStateCookieOptions,
  oauthStateCookieOptions,
} from "../../common/auth-cookie";
import { authRateLimit } from "../../common/security/auth-rate-limit";
import { AuthService } from "./auth.service";
import { LoginResponseDto } from "./dto/auth-response.dto";
import { LoginDto } from "./dto/login.dto";
import { GoogleOAuthService } from "./google-oauth.service";

/** A query value is text when it is a string; anything else (an array, an object) is ignored. */
const asText = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly googleOAuth: GoogleOAuthService,
  ) {}

  @Get("oauth/google/authorize")
  @ApiResponse({
    status: HttpStatus.FOUND,
    description: "Redirects the browser to Google's consent screen and sets the OAuth state cookie",
    headers: {
      Location: {
        description: "Google's authorization URL",
        schema: { type: "string" },
      },
    },
  })
  google(@Res() res: Response) {
    const { url, stateToken } = this.googleOAuth.buildAuthRequest();
    res.cookie(OAUTH_STATE_COOKIE_NAME, stateToken, oauthStateCookieOptions());
    res.redirect(url);
  }

  @Get("oauth/google/callback")
  @ApiResponse({
    status: HttpStatus.FOUND,
    description:
      "Redirects to the web app, setting the session cookie on success and an error reason on failure",
    headers: {
      Location: {
        description: "The web app URL to return to",
        schema: { type: "string" },
      },
    },
  })
  async googleCallback(
    @Query("code") code: unknown,
    @Query("error") error: unknown,
    @Query("state") state: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const result = await this.googleOAuth.handleCallback({
      code: asText(code),
      error: asText(error),
      state: asText(state),
      stateToken: asText(req.cookies?.[OAUTH_STATE_COOKIE_NAME]),
    });

    // The state cookie is good for one attempt, whatever the outcome.
    res.clearCookie(OAUTH_STATE_COOKIE_NAME, clearOauthStateCookieOptions());

    if (result.token) {
      res.cookie(SESSION_COOKIE_NAME, result.token, authCookieOptions());
    }

    res.redirect(result.url);
  }

  @Post("login")
  @Throttle(authRateLimit)
  @HttpCode(HttpStatus.OK)
  @ZodResponse({
    type: LoginResponseDto,
    status: 200,
    description: "The signed-in account; the session token is set as a cookie",
  })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { token, ...payload } = await this.authService.login(dto);
    res.cookie(SESSION_COOKIE_NAME, token, authCookieOptions());
    return payload;
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: "The session cookie is cleared" })
  logout(@Res() res: Response) {
    res.cookie(SESSION_COOKIE_NAME, "", {
      ...clearAuthCookieOptions(),
      maxAge: 0,
    });
    res.cookie("auth_token", "", {
      ...clearAuthCookieOptions(),
      maxAge: 0,
    });
    // 204: logout has no response body
    res.status(HttpStatus.NO_CONTENT).send();
  }
}
