import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectConnection } from "@nestjs/mongoose";
import { Connection } from "mongoose";
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
  connection: Connection,
  token: string,
): Promise<string | undefined> {
  let payload: JwtPayload;
  try {
    payload = jwtService.verify<JwtPayload>(token);
  } catch {
    return undefined;
  }
  if (typeof payload.userId !== "string") return undefined;

  try {
    const user = (await connection.model("User").findById(payload.userId).select("isActive")) as {
      isActive?: boolean;
    } | null;
    return user && user.isActive !== false ? payload.userId : undefined;
  } catch (error) {
    // A token whose id is not a valid id is simply not a session. Anything else (for example the
    // database being down) is a server fault and must not look like a sign-out.
    if ((error as { name?: string }).name === "CastError") return undefined;
    throw error;
  }
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = extractToken(request);

    if (!token) {
      throw new UnauthorizedException("unauthorized");
    }

    const userId = await activeUserIdFromToken(this.jwtService, this.connection, token);
    if (!userId) {
      throw new UnauthorizedException("unauthorized");
    }

    request.user = { userId };
    return true;
  }
}
