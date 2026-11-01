import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { Logger as AppLogger, PinoLogger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { configureApp } from "./app.setup";
import { setupSwagger } from "./config/swagger.config";

// Give asynchronous log transports a moment to flush before the process exits.
const EXIT_FLUSH_MS = 500;

function installProcessErrorHandlers(pino: PinoLogger["logger"]) {
  const fatal = (message: string) => (error: unknown) => {
    pino.fatal({ err: error }, message);
    setTimeout(() => process.exit(1), EXIT_FLUSH_MS).unref();
  };

  process.on("uncaughtException", fatal("Uncaught exception, shutting down"));
  process.on("unhandledRejection", fatal("Unhandled promise rejection, shutting down"));
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(AppLogger));
  // PinoLogger is transient-scoped, so it must be resolved rather than fetched.
  installProcessErrorHandlers((await app.resolve(PinoLogger)).logger);

  const config = app.get(ConfigService);
  const port = config.get<number>("port") || 5001;
  const backendUrl = config.get<string>("backendUrl");

  configureApp(app);

  const docsMounted = setupSwagger(app, config);
  app.enableShutdownHooks();

  await app.listen(port, "0.0.0.0");

  const logger = new Logger("Bootstrap");
  logger.log(`Server listening on port ${port} (public URL ${backendUrl})`);
  logger.log(
    docsMounted
      ? `API docs: ${backendUrl}/api-docs, health: ${backendUrl}/api/health`
      : `API docs are disabled (set ENABLE_API_DOCS=true to enable), health: ${backendUrl}/api/health`,
  );
}

bootstrap();
