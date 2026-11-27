import { startTracing, tracingConfigFromEnv } from "./tracing";

/**
 * Imported first by `main.ts` and `worker.ts`. Starting the SDK here, before Nest and Express are
 * required, lets the instrumentations patch those modules as they load. When tracing is disabled
 * (tests, or no OTLP endpoint configured) this is a no-op.
 */
export const tracingSdk = startTracing(tracingConfigFromEnv());
