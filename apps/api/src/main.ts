import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { Logger as PinoLogger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { configureApp } from "./app.setup";
import { setupSwagger } from "./config/swagger.config";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(PinoLogger));

  const config = app.get(ConfigService);
  const port = config.get<number>("port") || 5001;
  const backendUrl = config.get<string>("backendUrl");

  configureApp(app);

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
