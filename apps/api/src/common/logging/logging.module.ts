import { Injectable, Module, OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Logger, LoggerModule } from "nestjs-pino";
import { buildPinoHttpOptions, type LoggingSettings } from "./logging.options";

/** Optional log destination; tests replace it with an in-memory stream. */
export const LOG_DESTINATION = Symbol("LOG_DESTINATION");

@Injectable()
class ShutdownLogger implements OnApplicationShutdown {
  constructor(private readonly logger: Logger) {}

  onApplicationShutdown(signal?: string) {
    this.logger.log(`Application shutting down${signal ? ` (${signal})` : ""}`, "Shutdown");
  }
}

@Module({
  imports: [
    LoggerModule.forRootAsync({
      providers: [{ provide: LOG_DESTINATION, useValue: null }],
      inject: [ConfigService, LOG_DESTINATION],
      useFactory: (config: ConfigService, destination: NodeJS.WritableStream | null) => ({
        pinoHttp: buildPinoHttpOptions(config.getOrThrow<LoggingSettings>("logging"), destination),
      }),
    }),
  ],
  providers: [ShutdownLogger],
  exports: [LoggerModule],
})
export class AppLoggingModule {}
