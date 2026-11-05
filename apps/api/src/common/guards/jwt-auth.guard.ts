import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UsersRepository } from "../../database/repositories/users.repository";
import { SESSION_COOKIE_NAME } from "../auth-cookie";
import { JwtPayload } from "../types/jwt-payload.interface";

export const extractToken = (request: {
  headers: Record<string, string | string[] | undefined>;
  cookies?: Record<string, string>;
}): string | undefined => {
  const authHeader = request.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return request.cookies?.[SESSION_COOKIE_NAME];
};

/**
 * The id of the user a session token belongs to, or undefined when the token is invalid, carries no
 * user id, or belongs to an account that no longer exists or has been deactivated. Deactivating an
 * account therefore ends its existing sessions on the next request.
 */
export async function activeUserIdFromToken(
  jwtService: JwtService,
  users: UsersRepository,
  token: string,
): Promise<string | undefined> {
  let payload: JwtPayload;
  try {
    payload = jwtService.verify<JwtPayload>(token);
  } catch {
    return undefined;
  }
  if (typeof payload.userId !== "string") return undefined;

  const user = await users.findById(payload.userId);
  return user && user.status === "active" ? user.id : undefined;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly users: UsersRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = extractToken(request);

    if (!token) {
      throw new UnauthorizedException("unauthorized");
    }

    const userId = await activeUserIdFromToken(this.jwtService, this.users, token);
    if (!userId) {
      throw new UnauthorizedException("unauthorized");
    }

    request.user = { userId };
    return true;
  }
}
