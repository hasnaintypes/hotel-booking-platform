import { context, SpanKind, trace } from "@opentelemetry/api";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace";
import { describe, expect, it } from "vitest";
import { startTracing, tracingConfigFromEnv } from "./tracing";

describe("tracingConfigFromEnv", () => {
  it("is disabled without an endpoint and always disabled in tests", () => {
    expect(tracingConfigFromEnv({ NODE_ENV: "development" }).enabled).toBe(false);
    expect(tracingConfigFromEnv({ NODE_ENV: "test", OTEL_ENABLED: "true" }).enabled).toBe(false);
  });

  it("enables tracing when an OTLP endpoint is configured", () => {
    const config = tracingConfigFromEnv({
      NODE_ENV: "development",
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318",
    });

    expect(config.enabled).toBe(true);
    expect(config.endpoint).toBe("http://localhost:4318");
    expect(config.sampleRatio).toBe(1);
    expect(config.serviceName).toBe("hotel-booking-api");
  });

  it("samples a tenth in production and honours an override", () => {
    expect(tracingConfigFromEnv({ NODE_ENV: "production", OTEL_ENABLED: "true" }).sampleRatio).toBe(
      0.1,
    );
    expect(
      tracingConfigFromEnv({
        NODE_ENV: "production",
        OTEL_ENABLED: "true",
        OTEL_TRACES_SAMPLER_ARG: "0.5",
      }).sampleRatio,
    ).toBe(0.5);
    expect(
      tracingConfigFromEnv({
        NODE_ENV: "development",
        OTEL_ENABLED: "true",
        OTEL_TRACES_SAMPLER_ARG: "2",
      }).sampleRatio,
    ).toBe(1);
  });
});

describe("startTracing", () => {
  it("returns undefined when disabled", () => {
    expect(
      startTracing({ enabled: false, serviceName: "api", environment: "test", sampleRatio: 1 }),
    ).toBeUndefined();
  });

  it("exports a server span and a job span linked to it", async () => {
    const exporter = new InMemorySpanExporter();
    const processor = new SimpleSpanProcessor({ exporter });
    const sdk = startTracing(
      {
        enabled: true,
        serviceName: "hotel-booking-api",
        environment: "test",
        release: "test@1",
        sampleRatio: 1,
      },
      { spanProcessors: [processor], autoDetectResources: false },
    );
    expect(sdk).toBeDefined();

    // The HTTP instrumentation is covered by the running app; here a server span stands in for the
    // request that starts the trace, so the exporter, sampler and job-child wiring can be asserted.
    const tracer = trace.getTracer("test");
    const serverSpan = tracer.startSpan("GET /hello", { kind: SpanKind.SERVER });
    let observedTraceId: string | undefined;

    context.with(trace.setSpan(context.active(), serverSpan), () => {
      observedTraceId = trace.getSpan(context.active())?.spanContext().traceId;
      // A job runs in its own async context; inside this request it is a child of the server span.
      tracer.startActiveSpan(
        "job handler",
        { attributes: { "request.id": "req-12345678" } },
        (span) => span.end(),
      );
    });
    serverSpan.end();

    await processor.forceFlush();
    const spans = exporter.getFinishedSpans();
    await sdk!.shutdown();

    const jobSpan = spans.find((span) => span.name === "job handler");
    const exportedServerSpan = spans.find((span) => span.name === "GET /hello");

    expect(observedTraceId).toBe(serverSpan.spanContext().traceId);
    expect(jobSpan, "no job span exported").toBeDefined();
    expect(jobSpan!.spanContext().traceId).toBe(serverSpan.spanContext().traceId);
    expect(jobSpan!.parentSpanContext?.spanId).toBe(serverSpan.spanContext().spanId);
    expect(jobSpan!.attributes["request.id"]).toBe("req-12345678");

    expect(exportedServerSpan, "no server span exported").toBeDefined();
    expect(exportedServerSpan!.resource.attributes["service.name"]).toBe("hotel-booking-api");
    expect(exportedServerSpan!.resource.attributes["deployment.environment"]).toBe("test");
    expect(exportedServerSpan!.resource.attributes["service.version"]).toBe("test@1");
  });
});
