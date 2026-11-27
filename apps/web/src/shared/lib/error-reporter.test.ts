import type { ErrorInfo } from "react";
import { describe, expect, it, vi } from "vitest";
import { createErrorReporter, type SentryLike } from "./error-reporter";

function fakeSentry() {
  const init = vi.fn();
  const captureException = vi.fn();
  const setExtra = vi.fn();
  const withScope = vi.fn((callback: (scope: { setExtra: typeof setExtra }) => void) =>
    callback({ setExtra }),
  );
  const sentry: SentryLike = { init, withScope, captureException };
  return { sentry, init, captureException, setExtra };
}

const options = {
  dsn: "https://public@example.com/1",
  environment: "test",
  release: "web@abc123",
};

describe("createErrorReporter", () => {
  it("does nothing without a DSN", async () => {
    const load = vi.fn();
    const reporter = createErrorReporter({ environment: "test", release: "web@abc123" }, load);

    reporter.report(new Error("ignored"));
    await reporter.start();

    expect(load).not.toHaveBeenCalled();
  });

  it("initialises once and sends errors buffered before the SDK was ready", async () => {
    const { sentry, init, captureException, setExtra } = fakeSentry();
    const load = vi.fn().mockResolvedValue(sentry);
    const reporter = createErrorReporter(options, load);
    const error = new Error("render failed");
    const info = { componentStack: "\n    at BookingPage" } as ErrorInfo;

    reporter.report(error, info);
    expect(captureException).not.toHaveBeenCalled();

    await reporter.start();
    await reporter.start();

    expect(load).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledWith({
      dsn: options.dsn,
      environment: options.environment,
      release: options.release,
      tracesSampleRate: 0,
      sendDefaultPii: false,
    });
    expect(setExtra).toHaveBeenCalledWith("componentStack", info.componentStack);
    expect(captureException).toHaveBeenCalledWith(error);
  });

  it("sends errors directly once the SDK is ready", async () => {
    const { sentry, captureException } = fakeSentry();
    const reporter = createErrorReporter(options, vi.fn().mockResolvedValue(sentry));
    await reporter.start();

    const error = new Error("after start");
    reporter.report(error);

    expect(captureException).toHaveBeenCalledWith(error);
  });

  it("swallows a failed SDK download instead of breaking the page", async () => {
    const reporter = createErrorReporter(options, vi.fn().mockRejectedValue(new Error("blocked")));

    await expect(reporter.start()).resolves.toBeUndefined();
    expect(() => reporter.report(new Error("after failure"))).not.toThrow();
  });
});
