import * as SentryNode from "@sentry/node";
import { afterEach, describe, expect, it } from "vitest";
import { SentryErrorTracker, type SentryTransport } from "./sentry-error-tracker";

type CapturedEnvelope = [unknown, Array<[Record<string, unknown>, unknown]>];

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

/** Pulls event payloads out of the envelopes Sentry would have posted. */
function events(envelopes: CapturedEnvelope[]): Array<Record<string, unknown>> {
  return envelopes.flatMap(([, items]) =>
    items
      .filter(([headers]) => headers.type === "event")
      .map(([, payload]) => payload as Record<string, unknown>),
  );
}

const dsn = "https://abc123@o1.ingest.sentry.io/42";

describe("SentryErrorTracker", () => {
  afterEach(async () => {
    await SentryNode.close();
  });

  it("sends the error with its request context, release and environment", async () => {
    const { envelopes, transport } = capturingTransport();
    const tracker = new SentryErrorTracker(SentryNode, {
      dsn,
      environment: "test",
      release: "api@abc123",
      transport,
    });

    tracker.captureException(new Error("boom"), {
      requestId: "edge-tracker-1234",
      userId: "user-1",
      route: "/api/v1/hotels/:id",
      code: "INTERNAL_ERROR",
      status: 500,
      method: "GET",
      path: "/api/v1/hotels/8a5c",
    });

    expect(await tracker.flush(2_000)).toBe(true);

    const [event] = events(envelopes);
    expect(event, "no event envelope was sent").toBeDefined();
    expect(event.release).toBe("api@abc123");
    expect(event.environment).toBe("test");
    expect(event.tags).toMatchObject({
      requestId: "edge-tracker-1234",
      route: "/api/v1/hotels/:id",
      "error.code": "INTERNAL_ERROR",
      "http.status_code": "500",
      "http.method": "GET",
    });
    expect(event.user).toEqual({ id: "user-1" });
    expect(event.extra).toMatchObject({ path: "/api/v1/hotels/8a5c" });
    const exception = event.exception as { values?: Array<{ value?: string }> } | undefined;
    expect(exception?.values?.[0]?.value).toBe("boom");
  });
});
