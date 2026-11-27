process.env.RUN_WORKER ??= "true";

import "./observability/register-tracing";
import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Logger as AppLogger, PinoLogger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { ERROR_TRACKER, type ErrorTracker } from "./common/errors/error-tracker";
import { tracingSdk } from "./observability/register-tracing";

const EXIT_FLUSH_MS = 500;
const TRACKER_FLUSH_MS = 2_000;

function installProcessErrorHandlers(pino: PinoLogger["logger"], tracker: ErrorTracker) {
  const fatal = (message: string) => (error: unknown) => {
    pino.fatal({ err: error }, message);
    try {
      tracker.captureException(error, { tags: { process: "worker" } });
    } catch {
      // A broken tracker must never stop the worker from exiting.
    }
    void tracker
      .flush(TRACKER_FLUSH_MS)
      .catch(() => false)
      .then(() => {
        setTimeout(() => process.exit(1), EXIT_FLUSH_MS).unref();
      });
  };

  process.on("uncaughtException", fatal("Uncaught exception, shutting down worker"));
  process.on("unhandledRejection", fatal("Unhandled promise rejection, shutting down worker"));
}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });

  app.useLogger(app.get(AppLogger));
  const tracker = app.get<ErrorTracker>(ERROR_TRACKER);
  installProcessErrorHandlers((await app.resolve(PinoLogger)).logger, tracker);
  app.enableShutdownHooks();

  const shutdownTracing = () => {
    void tracingSdk?.shutdown().catch(() => undefined);
  };
  process.once("SIGTERM", shutdownTracing);
  process.once("SIGINT", shutdownTracing);

  new Logger("WorkerBootstrap").log(
    "Background worker started (HTTP listener disabled; set RUN_WORKER=true for in-process mode)",
  );
}

bootstrap();
