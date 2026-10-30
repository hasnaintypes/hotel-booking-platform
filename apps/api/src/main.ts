import "reflect-metadata";
import { Logger, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import compression from "compression";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { Logger as PinoLogger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { setupSwagger } from "./config/swagger.config";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(PinoLogger));

  const config = app.get(ConfigService);
  const port = config.get<number>("port") || 5001;
  const backendUrl = config.get<string>("backendUrl");

  const allowedOrigins = [
    config.get<string>("frontendUrl"),
    "http://localhost:5174",
    "http://localhost:5173",
  ].filter((origin): origin is string => Boolean(origin));

  const corsOrigin = (
    origin: string | undefined,
    callback: (error: Error | null, allow?: boolean) => void,
  ) => {
    if (!origin) return callback(null, true);

    if (origin.includes("netlify.app") || origin.includes("vercel.app")) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    if (config.get<string>("nodeEnv") === "development") {
      console.log("CORS blocked origin:", origin);
    }

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

  app.enableCors({
    origin: corsOrigin,
    credentials: true,
    optionsSuccessStatus: 204,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie", "X-Requested-With"],
  });

  setupSwagger(app, config);
  app.enableShutdownHooks();

  await app.listen(port, "0.0.0.0");

  const logger = new Logger("Bootstrap");
  logger.log("============================================");
  logger.log(`Server running on port ${port}`);
  logger.log(`Local: http://localhost:${port}`);
  logger.log(`Public: ${backendUrl}`);
  logger.log(`API Docs: ${backendUrl}/api-docs`);
  logger.log(`Health Check: ${backendUrl}/api/health`);
  logger.log("============================================");
}

bootstrap();
