import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request, Response } from "express";
import { map, type Observable } from "rxjs";
import { ifNoneMatchSatisfied, representationEtag } from "./etag";
import { RESPONSE_ETAG } from "./response-etag.decorator";

/**
 * Adds `ETag` to the responses of routes marked with `@ResponseEtag()`, and answers a matching
 * `If-None-Match` with `304`.
 *
 * It runs outermost, after the Zod serializer, so the tag covers the bytes the client actually
 * receives rather than the service's internal object.
 */
@Injectable()
export class ResponseEtagInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const enabled = this.reflector.getAllAndOverride<boolean>(RESPONSE_ETAG, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!enabled) return next.handle();

    return next.handle().pipe(
      map((body) => {
        if (body === undefined || body === null) return body;

        const http = context.switchToHttp();
        const request = http.getRequest<Request>();
        const response = http.getResponse<Response>();
        const etag = representationEtag(body);
        response.setHeader("ETag", etag);

        const ifNoneMatch = request.headers["if-none-match"];
        if (ifNoneMatchSatisfied(ifNoneMatch, etag)) {
          response.status(304);
          return null;
        }
        return body;
      }),
    );
  }
}
