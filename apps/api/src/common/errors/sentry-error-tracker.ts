import type * as SentryNode from "@sentry/node";
import type { ErrorTracker, ErrorTrackerContext } from "./error-tracker";

type SentryOptions = NonNullable<Parameters<typeof SentryNode.init>[0]>;
export type SentryTransport = NonNullable<SentryOptions["transport"]>;

export type SentryErrorTrackerOptions = {
  dsn: string;
  environment: string;
  release: string;
  /** Tests pass a recording transport; production lets the SDK build its HTTP transport. */
  transport?: SentryTransport;
};

/**
 * Thin adapter over the Sentry Node SDK. The SDK is loaded lazily by the factory, so a deployment
 * without `SENTRY_DSN` never pays for it. Traces are produced by our own OpenTelemetry SDK, so
 * Sentry's own tracer provider is left off.
 */
export class SentryErrorTracker implements ErrorTracker {
  constructor(
    private readonly sentry: typeof SentryNode,
    options: SentryErrorTrackerOptions,
  ) {
    this.sentry.init({
      dsn: options.dsn,
      environment: options.environment,
      release: options.release,
      tracesSampleRate: 0,
      enableOpenTelemetrySetup: false,
      ...(options.transport ? { transport: options.transport } : {}),
    });
  }

  captureException(error: unknown, context: ErrorTrackerContext = {}): void {
    this.sentry.withScope((scope) => {
      if (context.requestId) scope.setTag("requestId", context.requestId);
      if (context.userId) scope.setUser({ id: context.userId });
      if (context.route) scope.setTag("route", context.route);
      if (context.code) scope.setTag("error.code", context.code);
      if (context.status !== undefined) scope.setTag("http.status_code", String(context.status));
      if (context.method) scope.setTag("http.method", context.method);
      if (context.path) scope.setExtra("path", context.path);
      for (const [key, value] of Object.entries(context.tags ?? {})) scope.setTag(key, value);
      this.sentry.captureException(error);
    });
  }

  async flush(timeoutMs = 2_000): Promise<boolean> {
    return this.sentry.flush(timeoutMs);
  }
}
