import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { JwtPayload } from "../types/jwt-payload.interface";
import { extractToken } from "./jwt-auth.guard";

/**
 * For public routes whose response depends on who is asking. It identifies the caller when a valid
 * session is present and never rejects: a missing or invalid session is simply anonymous.
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const token = extractToken(request);

    if (token) {
      try {
        const payload = this.jwtService.verify<JwtPayload>(token);
        request.user = { userId: payload.userId };
      } catch {
        // Treated as anonymous.
      }
    }

    return true;
  }
}
