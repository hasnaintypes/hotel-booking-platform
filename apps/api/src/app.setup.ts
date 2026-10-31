import { Logger, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestExpressApplication } from "@nestjs/platform-express";
import compression from "compression";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { OriginGuard } from "./common/guards/origin.guard";
import { isAllowedOrigin } from "./common/security/allowed-origins";

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

    return callback(new Error("Not allowed by CORS"));
  };

  app.set("trust proxy", 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
      contentSecurityPolicy: false,
    }),
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
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalGuards(new OriginGuard(config));

  app.enableCors({
    origin: corsOrigin,
    credentials: true,
    optionsSuccessStatus: 204,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie", "X-Requested-With"],
  });
}
