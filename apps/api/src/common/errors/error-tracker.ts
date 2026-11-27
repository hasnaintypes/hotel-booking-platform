/**
 * The details every error report carries so a report can be joined to a log line, a trace and the
 * request that caused it. Everything except `requestId` is optional because the same interface is
 * used by the worker's process-level handlers, which have no HTTP request.
 */
export type ErrorTrackerContext = {
  requestId?: string;
  userId?: string;
  /** Route template (`/api/v1/hotels/:id`), never a concrete path. */
  route?: string;
  /** Stable application error code (`INTERNAL_ERROR`, `PAYMENT_FAILED`, ...). */
  code?: string;
  status?: number;
  method?: string;
  path?: string;
  /** Extra tags for provider-specific context, for example a job name. */
  tags?: Record<string, string>;
};

/**
 * Error reporting boundary. The API depends on this rather than on Sentry, so tests inject a
 * recorder and a deployment without a DSN pays nothing.
 */
export interface ErrorTracker {
  captureException(error: unknown, context?: ErrorTrackerContext): void;
  /** Flushes queued reports. Returns false when the timeout elapsed first. */
  flush(timeoutMs?: number): Promise<boolean>;
}

export class NoopErrorTracker implements ErrorTracker {
  captureException(): void {
    // Intentionally empty: no DSN is configured.
  }

  async flush(): Promise<boolean> {
    return true;
  }
}

/** Injection token for the process-wide tracker. */
export const ERROR_TRACKER = Symbol("ERROR_TRACKER");
