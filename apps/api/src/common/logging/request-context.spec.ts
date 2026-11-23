import { describe, expect, it } from "vitest";
import {
  currentRequestId,
  enrichRequestContext,
  getRequestContext,
  requestContextMixin,
  runWithRequestContext,
} from "./request-context";

describe("request context", () => {
  it("has no context outside a request or job", () => {
    expect(getRequestContext()).toBeUndefined();
    expect(currentRequestId()).toBeUndefined();
    expect(requestContextMixin()).toEqual({});
  });

  it("is readable synchronously and across asynchronous continuations", async () => {
    await runWithRequestContext({ requestId: "edge-req-12345678" }, async () => {
      expect(currentRequestId()).toBe("edge-req-12345678");
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 1));
      expect(currentRequestId()).toBe("edge-req-12345678");
      expect(requestContextMixin()).toEqual({ requestId: "edge-req-12345678" });
    });
  });

  it("keeps nested contexts separate and restores the outer one", () => {
    runWithRequestContext({ requestId: "outer-request-1" }, () => {
      runWithRequestContext({ requestId: "inner-request-1" }, () => {
        expect(currentRequestId()).toBe("inner-request-1");
      });
      expect(currentRequestId()).toBe("outer-request-1");
    });
    expect(currentRequestId()).toBeUndefined();
  });

  it("adds the authenticated user discovered after the context was created", () => {
    runWithRequestContext({ requestId: "edge-req-12345678" }, () => {
      enrichRequestContext({ userId: "user-1" });
      expect(getRequestContext()).toEqual({
        requestId: "edge-req-12345678",
        userId: "user-1",
      });
      expect(requestContextMixin()).toEqual({
        requestId: "edge-req-12345678",
        userId: "user-1",
      });
    });
  });

  it("does not create a context when there is none to enrich", () => {
    expect(() => enrichRequestContext({ userId: "user-1" })).not.toThrow();
    expect(getRequestContext()).toBeUndefined();
  });

  it("does not leak mutations between sibling runs", () => {
    const context = { requestId: "edge-req-12345678" };
    runWithRequestContext(context, () => enrichRequestContext({ userId: "user-1" }));
    runWithRequestContext(context, () => {
      expect(getRequestContext()).toEqual({ requestId: "edge-req-12345678" });
    });
  });
});
