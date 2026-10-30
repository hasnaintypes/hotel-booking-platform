import { BadRequestException, Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { InjectModel } from "@nestjs/mongoose";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Model } from "mongoose";
import { UserType } from "@hotel-booking/types";
import { USER_MODEL } from "../../database/models";
import { LoginDto } from "./dto/login.dto";

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(USER_MODEL) private readonly userModel: Model<UserType>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.userModel.findOne({ email: dto.email });
    if (!user) {
      throw new BadRequestException("Invalid Credentials");
    }

    const isMatch = await bcrypt.compare(dto.password, user.password);
    if (!isMatch) {
      throw new BadRequestException("Invalid Credentials");
    }

    const token = this.jwtService.sign({ userId: user.id });

    return {
      userId: user._id,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    };
  }

  buildGoogleAuthUrl(): string {
    const clientId = this.config.get<string>("google.clientId");
    if (!clientId) {
      throw new InternalServerErrorException("Google OAuth not configured");
    }

    const state = crypto.randomBytes(32).toString("hex");
    const redirectUri = `${this.config.get<string>("backendUrl")}/api/auth/callback/google`;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      access_type: "offline",
      prompt: "consent",
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async handleGoogleCallback(code?: string, error?: string): Promise<string> {
    const frontendUrl = this.config.get<string>("frontendUrl");
    const clientId = this.config.get<string>("google.clientId");
    const clientSecret = this.config.get<string>("google.clientSecret");

    if (error) {
      return `${frontendUrl}/sign-in?error=${encodeURIComponent(error)}`;
    }

    if (!code || !clientId || !clientSecret) {
      return `${frontendUrl}/sign-in?error=oauth_config`;
    }

    try {
      const redirectUri = `${this.config.get<string>("backendUrl")}/api/auth/callback/google`;
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      const tokenData = await tokenRes.json();
      if (tokenData.error) {
        console.error("Google token error:", tokenData);
        return `${frontendUrl}/sign-in?error=token_exchange`;
      }

      const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const googleUser = await userRes.json();

      const email = googleUser.email;
      const name = googleUser.name || "";
      const [firstName, ...lastParts] = name.split(" ");
      const lastName = lastParts.join(" ") || firstName;
      const image = googleUser.picture || undefined;

      let user = await this.userModel.findOne({ email });
      if (!user) {
        const randomPassword = crypto.randomBytes(32).toString("hex");
        user = new this.userModel({
          email,
          firstName: firstName || "User",
          lastName: lastName || "Google",
          password: randomPassword,
          image,
          emailVerified: true,
        });
        await user.save();
      } else {
        await this.userModel.findByIdAndUpdate(user._id, {
          image,
          emailVerified: true,
        });
      }

      const token = this.jwtService.sign({ userId: user.id });
      const redirectUrl = new URL(`${frontendUrl}/auth/callback`);
      redirectUrl.searchParams.set("token", token);
      redirectUrl.searchParams.set("userId", String(user._id));
      redirectUrl.searchParams.set("email", user.email);
      redirectUrl.searchParams.set("firstName", user.firstName);
      redirectUrl.searchParams.set("lastName", user.lastName);
      if (image) redirectUrl.searchParams.set("image", image);

      return redirectUrl.toString();
    } catch (error) {
      console.error("Google OAuth error:", error);
      return `${frontendUrl}/sign-in?error=server_error`;
    }
  }
}
