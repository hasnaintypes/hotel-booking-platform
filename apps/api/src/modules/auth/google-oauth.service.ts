import { Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { InjectModel } from "@nestjs/mongoose";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Model } from "mongoose";
import { UserType } from "@hotel-booking/types";
import { USER_MODEL } from "../../database/models";

/** The audience of the signed state token, so it can never be mistaken for a session token. */
const STATE_AUDIENCE = "oauth-state";
const STATE_TTL = "10m";
const GOOGLE_TIMEOUT_MS = 10_000;

export type GoogleAuthRequest = {
  /** Where to send the browser. */
  url: string;
  /** A short-lived signed token to keep in a cookie until Google sends the user back. */
  stateToken: string;
};

export type GoogleCallbackParams = {
  code?: string;
  error?: string;
  /** The `state` Google sent back in the query string. */
  state?: string;
  /** The signed token from the cookie set when the sign-in started. */
  stateToken?: string;
};

type StatePayload = { state?: unknown; verifier?: unknown };
type GoogleProfile = {
  email?: unknown;
  verified_email?: unknown;
  name?: unknown;
  picture?: unknown;
};

/**
 * Sign in with Google (authorisation code flow with PKCE).
 *
 * - The `state` value and PKCE verifier are kept in a signed, short-lived cookie and checked on
 *   the way back, so a callback that this browser did not start is refused.
 * - Only a Google-verified email can sign in.
 * - An existing account that was created with a password is not linked automatically: anyone could
 *   have registered someone else's address with a password they chose.
 * - The redirect back to the app carries no personal data; the app reads the profile from the API.
 */
@Injectable()
export class GoogleOAuthService {
  private readonly logger = new Logger(GoogleOAuthService.name);

  constructor(
    @InjectModel(USER_MODEL) private readonly userModel: Model<UserType>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  private get redirectUri() {
    return `${this.config.get<string>("backendUrl")}/api/auth/callback/google`;
  }

  buildAuthRequest(): GoogleAuthRequest {
    const clientId = this.config.get<string>("google.clientId");
    if (!clientId) {
      throw new InternalServerErrorException("Google OAuth not configured");
    }

    const state = randomBytes(32).toString("hex");
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");

    const stateToken = this.jwtService.sign(
      { state, verifier },
      { expiresIn: STATE_TTL, audience: STATE_AUDIENCE },
    );

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: this.redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      access_type: "offline",
      prompt: "consent",
    });

    return {
      url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      stateToken,
    };
  }

  /** Returns the PKCE verifier when the callback belongs to the sign-in this browser started. */
  private verifierFor(stateToken?: string, state?: string): string | undefined {
    if (!stateToken || !state) return undefined;

    let payload: StatePayload;
    try {
      payload = this.jwtService.verify<StatePayload>(stateToken, { audience: STATE_AUDIENCE });
    } catch {
      return undefined;
    }
    if (typeof payload.state !== "string" || typeof payload.verifier !== "string") {
      return undefined;
    }

    const expected = Buffer.from(payload.state);
    const received = Buffer.from(state);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      return undefined;
    }

    return payload.verifier;
  }

  async handleCallback(params: GoogleCallbackParams): Promise<{ url: string; token?: string }> {
    const frontendUrl = this.config.get<string>("frontendUrl");
    const fail = (reason: string) => ({ url: `${frontendUrl}/sign-in?error=${reason}` });

    // Google's own error text is never passed on; only these fixed reasons reach the app.
    if (params.error)
      return fail(params.error === "access_denied" ? "access_denied" : "oauth_error");

    const verifier = this.verifierFor(params.stateToken, params.state);
    if (!verifier) return fail("oauth_state");

    const clientId = this.config.get<string>("google.clientId");
    const clientSecret = this.config.get<string>("google.clientSecret");
    if (!params.code || !clientId || !clientSecret) return fail("oauth_config");

    try {
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
        body: new URLSearchParams({
          code: params.code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: this.redirectUri,
          grant_type: "authorization_code",
          code_verifier: verifier,
        }),
      });

      const tokenData = (await tokenRes.json()) as { error?: unknown; access_token?: unknown };
      if (tokenData.error || typeof tokenData.access_token !== "string") {
        this.logger.warn("Google token exchange failed");
        return fail("token_exchange");
      }

      const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
        signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
      });
      if (!userRes.ok) return fail("server_error");
      const profile = (await userRes.json()) as GoogleProfile;

      if (typeof profile.email !== "string" || profile.verified_email !== true) {
        return fail("email_unverified");
      }

      return await this.signIn(profile as GoogleProfile & { email: string }, frontendUrl);
    } catch (error) {
      this.logger.error(
        "Google OAuth callback failed",
        error instanceof Error ? error.stack : undefined,
      );
      return fail("server_error");
    }
  }

  private async signIn(profile: GoogleProfile & { email: string }, frontendUrl?: string) {
    const fail = (reason: string) => ({ url: `${frontendUrl}/sign-in?error=${reason}` });
    const image = typeof profile.picture === "string" ? profile.picture : undefined;

    let user = await this.userModel.findOne({ email: profile.email });

    if (user) {
      if (user.isActive === false) return fail("account_disabled");
      // Created with a password, never confirmed to belong to the Google account's owner.
      if (user.emailVerified !== true) return fail("account_exists");
      if (image && image !== user.image) {
        await this.userModel.updateOne({ _id: user._id }, { $set: { image } });
      }
    } else {
      const name = typeof profile.name === "string" ? profile.name.trim() : "";
      const [firstName, ...lastParts] = name.split(/\s+/);
      user = new this.userModel({
        email: profile.email,
        firstName: firstName || "User",
        lastName: lastParts.join(" ") || firstName || "Google",
        // Never used to sign in; the account is reached through Google.
        password: randomBytes(32).toString("hex"),
        image,
        emailVerified: true,
      });
      await user.save();
    }

    const token = this.jwtService.sign({ userId: user.id });
    // No personal data in the URL: the app signs in from the cookie and reads the profile itself.
    return { url: `${frontendUrl}/auth/callback?authenticated=1`, token };
  }
}
