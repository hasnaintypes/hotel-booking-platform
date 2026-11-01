import { ArgumentsHost, Catch, ExceptionFilter, Injectable } from "@nestjs/common";
import type { Request, Response } from "express";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import { pathOnly } from "../logging/redaction";
import { REQUEST_ID_HEADER } from "../logging/request-id";
import { allowedMethodsFor } from "../routing/route-table";
import { mapException, methodNotAllowed } from "./exception-mapper";
import { PROBLEM_CONTENT_TYPE, problemType, type ProblemDetails } from "./problem";

/**
 * The single place where errors become HTTP responses: every error class is mapped
 * deliberately, responses use RFC 9457 problem details, and nothing internal leaks.
 */
@Catch()
@Injectable()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(@InjectPinoLogger(GlobalExceptionFilter.name) private readonly logger: PinoLogger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<Request & { id?: string }>();
    const response = http.getResponse<Response>();

    const mapped = mapException(exception);
    // A path that exists under another method is 405, not 404.
    const allowed =
      mapped.status === 404 ? allowedMethodsFor(pathOnly(request.originalUrl ?? request.url)) : [];
    const wrongMethod = allowed.length > 0 && !allowed.includes(request.method);
    const result = wrongMethod ? methodNotAllowed(allowed) : mapped;
    // pino-http attaches `req.log` when it ran. Requests rejected earlier (CORS, body
    // parsing) never reach the access logger, so they are logged here instead.
    const rejectedBeforeAccessLog = !(request as { log?: unknown }).log;
    const requestId =
      request.id ??
      (response.getHeader("X-Request-Id") as string | undefined) ??
      (request.headers?.[REQUEST_ID_HEADER] as string | undefined);

    // 5xx faults are logged with the original error (stack stays server-side).
    // 4xx are already visible in the access log (warn); detail only at debug level.
    if (result.status >= 500) {
      this.logger.error(
        { err: exception, status: result.status, code: result.code, requestId },
        `Unhandled ${result.code}`,
      );
    } else if (rejectedBeforeAccessLog) {
      this.logger.warn(
        {
          requestId,
          method: request.method,
          path: pathOnly(request.originalUrl ?? request.url),
          status: result.status,
          code: result.code,
          remoteAddress: request.socket?.remoteAddress,
          userAgent: request.headers?.["user-agent"],
        },
        `${request.method} ${result.status} rejected before routing`,
      );
    } else {
      this.logger.debug({ status: result.status, code: result.code }, result.detail);
    }

    if (response.headersSent) return;

    const body: ProblemDetails = {
      type: problemType(result.code),
      title: result.title,
      status: result.status,
      detail: result.detail,
      instance: pathOnly(request.originalUrl ?? request.url),
      code: result.code,
      ...(requestId ? { requestId } : {}),
      ...(result.errors?.length ? { errors: result.errors } : {}),
      message: result.detail,
    };

    if (result.headers) response.set(result.headers);
    response.status(result.status).type(PROBLEM_CONTENT_TYPE).send(JSON.stringify(body));
  }
}
