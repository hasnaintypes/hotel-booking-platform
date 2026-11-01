import { ForbiddenException, Logger, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestExpressApplication } from "@nestjs/platform-express";
import type { NextFunction, Request, Response } from "express";
import compression from "compression";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { CORS_REJECTION_MESSAGE } from "./common/errors/exception-mapper";
import {
  flattenValidationErrors,
  ValidationFailedException,
} from "./common/errors/validation-failed.exception";
import { REQUEST_ID_HEADER, resolveRequestId } from "./common/logging/request-id";
import { InvalidJsonException } from "./common/errors/invalid-json.exception";
import { OriginGuard } from "./common/guards/origin.guard";
import { isAllowedOrigin } from "./common/security/allowed-origins";

const BODY_LIMIT = "100kb";

// The API only returns JSON, so the default policy denies everything. The Swagger UI
// (served under /api-docs, development only) needs inline scripts and styles, so only
// that path gets a relaxed policy.
const strictHeaders = helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
});
const docsHeaders = helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      frameAncestors: ["'none'"],
    },
  },
});
const DOCS_PATH = /^\/api-docs(\/|$)/;
const securityHeaders = (req: Request, res: Response, next: NextFunction) =>
  (DOCS_PATH.test(req.path) ? docsHeaders : strictHeaders)(req, res, next);

/**
 * Applies the middleware, pipes, filters, guards and CORS policy shared by the
 * production server and the integration tests, so tests exercise the same
 * request pipeline that runs in production.
 */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(ConfigService);
  const logger = new Logger("Cors");

  const corsOrigin = (
    origin: string | undefined,
    callback: (error: Error | null, allow?: boolean) => void,
  ) => {
    if (!origin) return callback(null, true);

    if (isAllowedOrigin(origin, config)) {
      return callback(null, true);
    }

    logger.warn(`Blocked origin: ${origin}`);

    return callback(new ForbiddenException(CORS_REJECTION_MESSAGE));
  };

  app.set("trust proxy", 1);

  // Assign the request id before anything that can reject a request (CORS, body parsing),
  // so every response and log line is correlated. pino-http reuses `req.id`.
  app.use((req: Request & { id?: string }, res: Response, next: NextFunction) => {
    req.id = resolveRequestId(req.headers[REQUEST_ID_HEADER]);
    res.setHeader("X-Request-Id", req.id);
    next();
  });

  app.use(securityHeaders);
  // Explicit body parsers: bounded size, and parser failures become typed errors
  // (Nest would otherwise reduce them to message-only exceptions).
  app.useBodyParser("json", { limit: BODY_LIMIT });
  app.useBodyParser("urlencoded", { extended: true, limit: BODY_LIMIT });
  app.use(
    (error: { type?: string } | undefined, _req: Request, _res: Response, next: NextFunction) => {
      next(error?.type === "entity.parse.failed" ? new InvalidJsonException() : error);
    },
  );
  app.use(compression());
  app.use(cookieParser());
  app.use((_req: unknown, res: any, next: () => void) => {
    res.header("Vary", "Origin");
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // No implicit conversion: it turns any object, and even the string "false", into `true` for a
      // boolean, and coerces objects to the text "[object Object]". DTOs that accept text input
      // (query strings, multipart forms) convert explicitly with @Transform.
      transform: true,
      exceptionFactory: (errors) => new ValidationFailedException(flattenValidationErrors(errors)),
    }),
  );
  app.useGlobalGuards(new OriginGuard(config));

  app.enableCors({
    origin: corsOrigin,
    credentials: true,
    optionsSuccessStatus: 204,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie", "X-Requested-With"],
  });
}
