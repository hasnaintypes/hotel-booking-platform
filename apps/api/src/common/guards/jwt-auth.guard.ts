import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { SESSION_COOKIE_NAME } from "../auth-cookie";
import { JwtPayload } from "../types/jwt-payload.interface";

const extractToken = (request: {
  headers: Record<string, string | string[] | undefined>;
  cookies?: Record<string, string>;
}): string | undefined => {
  const authHeader = request.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return request.cookies?.[SESSION_COOKIE_NAME];
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const token = extractToken(request);

    if (!token) {
      throw new UnauthorizedException("unauthorized");
    }

    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      request.user = { userId: payload.userId };
      return true;
    } catch {
      throw new UnauthorizedException("unauthorized");
    }
  }
}
