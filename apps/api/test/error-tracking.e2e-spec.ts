import * as SentryNode from "@sentry/node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  SentryErrorTracker,
  type SentryTransport,
} from "../src/common/errors/sentry-error-tracker";
import { createTestApp, type TestApp } from "./support/create-app";
import { anonymous } from "./support/helpers";

type CapturedEnvelope = [unknown, Array<[Record<string, unknown>, unknown]>];

/** A transport that records envelopes instead of posting them to Sentry. */
function capturingTransport() {
  const envelopes: CapturedEnvelope[] = [];
  const transport: SentryTransport = () => ({
    send: async (envelope) => {
      envelopes.push(envelope as unknown as CapturedEnvelope);
      return { statusCode: 200 };
    },
    flush: async () => true,
  });
  return { envelopes, transport };
}

function events(envelopes: CapturedEnvelope[]): Array<Record<string, unknown>> {
  return envelopes.flatMap(([, items]) =>
    items
      .filter(([headers]) => headers.type === "event")
      .map(([, payload]) => payload as Record<string, unknown>),
  );
}

describe("error tracking", () => {
  let t: TestApp;
  let tracker: SentryErrorTracker;
  let envelopes: CapturedEnvelope[];

  beforeAll(async () => {
    const capture = capturingTransport();
    envelopes = capture.envelopes;
    tracker = new SentryErrorTracker(SentryNode, {
      dsn: "https://abc123@o1.ingest.sentry.io/42",
      environment: "test",
      release: "api@abc123",
      transport: capture.transport,
    });
    t = await createTestApp({ faults: true, errorTracker: tracker });
  });

  afterAll(async () => {
    await t?.close();
    await SentryNode.close();
  });

  it("reports a 5xx with the request id, release and environment", async () => {
    const requestId = "edge-tracker-1234";
    const response = await anonymous(t).get("/api/v1/__test__/boom").set("X-Request-Id", requestId);

    expect(response.status).toBe(500);
    expect(response.body.code).toBe("INTERNAL_ERROR");
    expect(await tracker.flush(2_000)).toBe(true);

    const [event] = events(envelopes);
    expect(event, "no error event was reported").toBeDefined();
    expect(event.release).toBe("api@abc123");
    expect(event.environment).toBe("test");
    expect(event.tags).toMatchObject({
      requestId,
      "error.code": "INTERNAL_ERROR",
      "http.status_code": "500",
      "http.method": "GET",
    });
    expect(String((event.tags as Record<string, unknown>).route)).toContain("/__test__/boom");
    const exception = event.exception as { values?: Array<{ value?: string }> } | undefined;
    expect(exception?.values?.[0]?.value).toContain("connection failed");
  });

  it("does not report an expected 400 validation failure", async () => {
    const before = events(envelopes).length;

    const response = await anonymous(t)
      .post("/api/v1/__test__/echo")
      .send({ email: "not-an-email", count: 0 });

    expect(response.status).toBe(400);
    await tracker.flush(2_000);
    expect(events(envelopes).length).toBe(before);
  });
});
