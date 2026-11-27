import { context, trace } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";
import { NestInstrumentation } from "@opentelemetry/instrumentation-nestjs-core";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { defaultResource, resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK, type NodeSDKConfiguration } from "@opentelemetry/sdk-node";
import {
  ParentBasedSampler,
  SimpleSpanProcessor,
  TraceIdRatioBasedSampler,
  type SpanExporter,
  type SpanProcessor,
} from "@opentelemetry/sdk-trace";

/**
 * The tracing settings an operator controls. `enabled` is deliberately separate from `endpoint`:
 * without a collector, tracing is a no-op rather than a stream of failed exports.
 */
export type TracingConfig = {
  enabled: boolean;
  serviceName: string;
  environment: string;
  release?: string;
  /** Root sample ratio, 0..1. */
  sampleRatio: number;
  endpoint?: string;
};

export type TracingDependencies = {
  /** Used by tests with an in-memory exporter instead of a network collector. */
  exporter?: SpanExporter;
  spanProcessors?: SpanProcessor[];
  instrumentations?: NodeSDKConfiguration["instrumentations"];
  /** Tests disable resource detection so a span is exported as soon as it ends. */
  autoDetectResources?: boolean;
};

const TRACE_PATHS = ["/v1/traces", "/v1/metrics", "/v1/logs"];
const TELEMETRY_HOSTS = ["localhost:4318", "127.0.0.1:4318"];

const isTelemetryPath = (path: string | undefined): boolean =>
  !!path && TRACE_PATHS.some((prefix) => path.includes(prefix));

const isTelemetryHost = (host: string | undefined): boolean =>
  !!host && (host.includes("ingest.sentry.io") || TELEMETRY_HOSTS.includes(host));

/** Reads the `host` header from an outgoing request's options. */
const outgoingHost = (request: { headers?: unknown }): string | undefined => {
  const headers = request.headers as Record<string, string | string[] | undefined> | undefined;
  const value = headers?.host;
  return Array.isArray(value) ? value[0] : value;
};

/**
 * Requests that are pure infrastructure noise: health probes, the scrape endpoint and the docs UI
 * are excluded so they do not dominate the trace list. `OPTIONS` preflights are excluded too.
 */
const ignoredIncomingPath = (url: string | undefined): boolean => {
  if (!url) return false;
  return (
    url.startsWith("/health/") ||
    url.startsWith("/metrics") ||
    url.startsWith("/api-docs") ||
    url.startsWith("/api/docs")
  );
};

const defaultInstrumentations = (): NodeSDKConfiguration["instrumentations"] => [
  new HttpInstrumentation({
    ignoreIncomingRequestHook: (request) => ignoredIncomingPath(request.url),
    // Exporting a span must not create a span for the export itself.
    ignoreOutgoingRequestHook: (request) =>
      isTelemetryHost(outgoingHost(request)) || isTelemetryPath(request.path),
  }),
  new ExpressInstrumentation(),
  new NestInstrumentation(),
  // pg-boss polls the database on a timer. Requiring a parent span keeps its polling out of the
  // trace list while still tracing every query made inside an HTTP request or job.
  new PgInstrumentation({ requireParentSpan: true, ignoreConnectSpans: true }),
  new UndiciInstrumentation({
    // `fetch` calls made outside a request/job (for example a background probe) have no parent.
    ignoreRequestHook: (request) =>
      trace.getSpan(context.active()) === undefined ||
      isTelemetryHost(request.origin) ||
      isTelemetryPath(request.path),
  }),
];

const parseRatio = (value: string | undefined, fallback: number): number => {
  if (value === undefined || value === "") return fallback;
  const ratio = Number(value);
  if (!Number.isFinite(ratio)) return fallback;
  return Math.min(1, Math.max(0, ratio));
};

/**
 * Reads the standard OTel environment variables plus two local ones:
 * - `OTEL_ENABLED` defaults to true when an OTLP endpoint is configured, false otherwise.
 * - `APP_RELEASE` is attached as `service.version` so traces and error reports agree.
 *
 * The sampler defaults to `parentbased_traceidratio`: 1.0 locally (see every request) and 0.1 in
 * production (enough to spot trends without paying for every trace). `OTEL_TRACES_SAMPLER_ARG`
 * overrides the ratio.
 */
export function tracingConfigFromEnv(env: NodeJS.ProcessEnv = process.env): TracingConfig {
  const environment = env.NODE_ENV ?? "development";
  const endpoint = env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ?? env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const enabledByEnv = env.OTEL_ENABLED === undefined ? !!endpoint : env.OTEL_ENABLED === "true";
  const defaultRatio = environment === "production" ? 0.1 : 1;

  return {
    enabled: environment === "test" ? false : enabledByEnv,
    serviceName: env.OTEL_SERVICE_NAME ?? "hotel-booking-api",
    environment,
    ...(env.APP_RELEASE ? { release: env.APP_RELEASE } : {}),
    sampleRatio: parseRatio(env.OTEL_TRACES_SAMPLER_ARG, defaultRatio),
    ...(endpoint ? { endpoint } : {}),
  };
}

/**
 * Starts the OpenTelemetry SDK. Called from `register-tracing.ts`, which both entrypoints import
 * before Nest, so the HTTP/Express/pg patches are installed before those modules load.
 */
export function startTracing(
  config: TracingConfig,
  dependencies: TracingDependencies = {},
): NodeSDK | undefined {
  if (!config.enabled) return undefined;

  const resource = defaultResource().merge(
    resourceFromAttributes({
      "service.name": config.serviceName,
      "deployment.environment": config.environment,
      ...(config.release ? { "service.version": config.release } : {}),
    }),
  );

  const spanProcessors =
    dependencies.spanProcessors ??
    (dependencies.exporter
      ? [new SimpleSpanProcessor({ exporter: dependencies.exporter })]
      : undefined);

  const sdk = new NodeSDK({
    resource,
    sampler: new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(config.sampleRatio) }),
    instrumentations: dependencies.instrumentations ?? defaultInstrumentations(),
    ...(dependencies.autoDetectResources === undefined
      ? {}
      : { autoDetectResources: dependencies.autoDetectResources }),
    ...(spanProcessors ? { spanProcessors } : { traceExporter: new OTLPTraceExporter() }),
  });

  sdk.start();
  return sdk;
}
