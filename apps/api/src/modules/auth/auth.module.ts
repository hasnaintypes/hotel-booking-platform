import { Module } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { GoogleOAuthService } from "./google-oauth.service";
import { LoginAttemptTracker } from "./login-attempts";

@Module({
  providers: [AuthService, GoogleOAuthService, LoginAttemptTracker],
  exports: [AuthService, GoogleOAuthService],
})
export class AuthModule {}
