import "./observability/register-tracing";
import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { Logger as AppLogger, PinoLogger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { configureApp } from "./app.setup";
import { ERROR_TRACKER, type ErrorTracker } from "./common/errors/error-tracker";
import { setupSwagger } from "./config/swagger.config";
import { tracingSdk } from "./observability/register-tracing";

// Give asynchronous log transports a moment to flush before the process exits.
const EXIT_FLUSH_MS = 500;
const TRACKER_FLUSH_MS = 2_000;

function installProcessErrorHandlers(pino: PinoLogger["logger"], tracker: ErrorTracker) {
  const fatal = (message: string) => (error: unknown) => {
    pino.fatal({ err: error }, message);
    try {
      tracker.captureException(error, { tags: { process: "api" } });
    } catch {
      // A broken tracker must never stop the process from exiting.
    }
    void tracker
      .flush(TRACKER_FLUSH_MS)
      .catch(() => false)
      .then(() => {
        setTimeout(() => process.exit(1), EXIT_FLUSH_MS).unref();
      });
  };

  process.on("uncaughtException", fatal("Uncaught exception, shutting down"));
  process.on("unhandledRejection", fatal("Unhandled promise rejection, shutting down"));
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    // Keeps the exact bytes of every JSON request so the Stripe webhook can verify the
    // signature over the payload Stripe signed, not a re-serialised object.
    rawBody: true,
  });

  app.useLogger(app.get(AppLogger));
  // PinoLogger is transient-scoped, so it must be resolved rather than fetched.
  const tracker = app.get<ErrorTracker>(ERROR_TRACKER);
  installProcessErrorHandlers((await app.resolve(PinoLogger)).logger, tracker);

  const config = app.get(ConfigService);
  const port = config.get<number>("port") || 5001;
  const backendUrl = config.get<string>("backendUrl");

  configureApp(app);

  const docsMounted = setupSwagger(app, config);
  app.enableShutdownHooks();

  // Flush any buffered spans before the process exits. Nest's own shutdown hook closes the app;
  // this one only drains the tracing exporter.
  const shutdownTracing = () => {
    void tracingSdk?.shutdown().catch(() => undefined);
  };
  process.once("SIGTERM", shutdownTracing);
  process.once("SIGINT", shutdownTracing);

  await app.listen(port, "0.0.0.0");

  const logger = new Logger("Bootstrap");
  logger.log(`Server listening on port ${port} (public URL ${backendUrl})`);
  logger.log(
    docsMounted
      ? `API docs: ${backendUrl}/api-docs, health: ${backendUrl}/health/live`
      : `API docs are disabled (set ENABLE_API_DOCS=true to enable), health: ${backendUrl}/health/live`,
  );
}

bootstrap();
