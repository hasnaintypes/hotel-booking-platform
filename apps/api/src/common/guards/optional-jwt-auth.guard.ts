import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UsersRepository } from "../../database/repositories/users.repository";
import { activeUserIdFromToken, extractToken } from "./jwt-auth.guard";

/**
 * For public routes whose response depends on who is asking. It identifies the caller when a valid
 * session of an active account is present and never rejects: a missing, invalid or deactivated
 * session is simply anonymous.
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly users: UsersRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = extractToken(request);

    if (token) {
      const userId = await activeUserIdFromToken(this.jwtService, this.users, token);
      if (userId) request.user = { userId };
    }

    return true;
  }
}
