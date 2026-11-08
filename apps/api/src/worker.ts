process.env.RUN_WORKER ??= "true";

import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Logger as AppLogger, PinoLogger } from "nestjs-pino";
import { AppModule } from "./app.module";

const EXIT_FLUSH_MS = 500;

function installProcessErrorHandlers(pino: PinoLogger["logger"]) {
  const fatal = (message: string) => (error: unknown) => {
    pino.fatal({ err: error }, message);
    setTimeout(() => process.exit(1), EXIT_FLUSH_MS).unref();
  };

  process.on("uncaughtException", fatal("Uncaught exception, shutting down worker"));
  process.on("unhandledRejection", fatal("Unhandled promise rejection, shutting down worker"));
}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });

  app.useLogger(app.get(AppLogger));
  installProcessErrorHandlers((await app.resolve(PinoLogger)).logger);
  app.enableShutdownHooks();

  new Logger("WorkerBootstrap").log(
    "Background worker started (HTTP listener disabled; set RUN_WORKER=true for in-process mode)",
  );
}

bootstrap();
