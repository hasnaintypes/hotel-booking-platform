import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { GoogleOAuthService } from "./google-oauth.service";
import { LoginAttemptTracker } from "./login-attempts";

@Module({
  controllers: [AuthController],
  providers: [AuthService, GoogleOAuthService, LoginAttemptTracker],
})
export class AuthModule {}
