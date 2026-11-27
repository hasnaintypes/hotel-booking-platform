import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ERROR_TRACKER, NoopErrorTracker, type ErrorTracker } from "./error-tracker";
import { SentryErrorTracker } from "./sentry-error-tracker";

/**
 * Builds the tracker from configuration. The Sentry SDK is imported only when a DSN is set, so
 * local development and tests never load it.
 */
export async function createErrorTracker(config: ConfigService): Promise<ErrorTracker> {
  const dsn = config.get<string>("sentry.dsn");
  if (!dsn) return new NoopErrorTracker();

  const sentry = await import("@sentry/node");

  return new SentryErrorTracker(sentry, {
    dsn,
    environment: config.get<string>("nodeEnv") ?? "development",
    release: config.get<string>("release") ?? "development",
  });
}

@Global()
@Module({
  providers: [
    {
      provide: ERROR_TRACKER,
      useFactory: createErrorTracker,
      inject: [ConfigService],
    },
  ],
  exports: [ERROR_TRACKER],
})
export class ErrorTrackingModule {}
