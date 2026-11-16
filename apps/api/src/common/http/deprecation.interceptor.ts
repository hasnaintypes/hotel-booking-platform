import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Response } from "express";
import type { Observable } from "rxjs";
import { DEPRECATION, type DeprecationInfo } from "./deprecation.decorator";

const toHttpDate = (value: Date): string => value.toUTCString();
const toStructuredDate = (value: Date): string => `@${Math.floor(value.getTime() / 1_000)}`;

/** Writes the `Deprecation`, `Sunset` and successor `Link` headers for `@Deprecated()` routes. */
@Injectable()
export class DeprecationInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const info = this.reflector.getAllAndOverride<DeprecationInfo>(DEPRECATION, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!info) return next.handle();

    const response = context.switchToHttp().getResponse<Response>();
    response.setHeader("Deprecation", toStructuredDate(info.since));
    if (info.sunset) response.setHeader("Sunset", toHttpDate(info.sunset));
    if (info.replacement) {
      response.setHeader("Link", `<${info.replacement}>; rel="successor-version"`);
    }

    return next.handle();
  }
}
