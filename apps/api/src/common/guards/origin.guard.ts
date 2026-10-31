import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { isAllowedOrigin } from "../security/allowed-origins";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

@Injectable()
export class OriginGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    if (SAFE_METHODS.has(request.method)) return true;

    // Header auth is not a CSRF target; cookie auth is.
    if (request.headers.authorization?.startsWith("Bearer ")) return true;

    const origin = this.resolveOrigin(request);
    if (!origin) return true;

    if (isAllowedOrigin(origin, this.config)) return true;

    throw new ForbiddenException("Request origin not allowed");
  }

  private resolveOrigin(request: {
    headers: { origin?: string; referer?: string };
  }): string | undefined {
    if (request.headers.origin) return request.headers.origin;

    if (request.headers.referer) {
      try {
        return new URL(request.headers.referer).origin;
      } catch {
        return undefined;
      }
    }

    return undefined;
  }
}
