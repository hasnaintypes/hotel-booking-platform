import type { ErrorInfo } from "react";

/** The subset of `@sentry/react` this module uses, so a test can inject a fake. */
export type SentryLike = {
  init(options: Record<string, unknown>): unknown;
  withScope(callback: (scope: { setExtra(key: string, value: unknown): void }) => void): void;
  captureException(error: unknown): unknown;
};

export type ErrorReporterOptions = {
  /** Reporting is off unless a DSN is configured. */
  dsn?: string;
  environment: string;
  release: string;
};

export type ErrorReporter = {
  /** Loads the SDK and sends anything buffered before it was ready. Idempotent. */
  start(): Promise<void>;
  /** Reports a render error caught by `ErrorBoundary`, buffering until the SDK is ready. */
  report(error: Error, info?: ErrorInfo): void;
};

const loadSentry = async (): Promise<SentryLike> =>
  (await import("@sentry/react")) as unknown as SentryLike;

/**
 * Builds the SPA error reporter. The SDK is imported dynamically so it lands in its own chunk:
 * the entry bundle is close to the size budget and Sentry must not push it over.
 */
export function createErrorReporter(
  options: ErrorReporterOptions,
  load: () => Promise<SentryLike> = loadSentry,
): ErrorReporter {
  let sentry: SentryLike | undefined;
  let started: Promise<void> | undefined;
  const pending: Array<{ error: Error; info?: ErrorInfo }> = [];

  const send = (client: SentryLike, error: Error, info?: ErrorInfo) => {
    client.withScope((scope) => {
      if (info?.componentStack) scope.setExtra("componentStack", info.componentStack);
      client.captureException(error);
    });
  };

  return {
    start() {
      if (!options.dsn) return Promise.resolve();
      started ??= load()
        .then((client) => {
          client.init({
            dsn: options.dsn,
            environment: options.environment,
            release: options.release,
            // Errors only. Traces come from the API; the browser has no collector.
            tracesSampleRate: 0,
            sendDefaultPii: false,
          });
          sentry = client;
          for (const item of pending.splice(0)) send(client, item.error, item.info);
        })
        .catch(() => {
          // A blocked or failed SDK download must never break the page.
        });
      return started;
    },

    report(error, info) {
      if (!options.dsn) return;
      if (sentry) send(sentry, error, info);
      else pending.push({ error, info });
    },
  };
}
