import { describe, expect, it, vi } from "vitest";
import { runStripeCall, stripeClientOptions, stripeOutcome } from "./stripe.service";

describe("stripeClientOptions", () => {
  it("leaves the SDK defaults untouched when no override is configured", () => {
    expect(stripeClientOptions(undefined)).toEqual({});
    expect(stripeClientOptions("")).toEqual({});
  });

  it("maps an http origin onto SDK host, port and protocol", () => {
    expect(stripeClientOptions("http://127.0.0.1:12111")).toEqual({
      host: "127.0.0.1",
      port: 12111,
      protocol: "http",
    });
  });

  it("maps an https origin and defaults the port", () => {
    expect(stripeClientOptions("https://stripe-mock.internal")).toEqual({
      host: "stripe-mock.internal",
      port: 443,
      protocol: "https",
    });
  });

  it("defaults the port for an http origin without one", () => {
    expect(stripeClientOptions("http://stripe-mock.internal")).toEqual({
      host: "stripe-mock.internal",
      port: 80,
      protocol: "http",
    });
  });
});

describe("stripeOutcome", () => {
  it("collapses known Stripe error types into a small vocabulary", () => {
    expect(stripeOutcome({ type: "StripeCardError" })).toBe("card_error");
    expect(stripeOutcome({ type: "StripeRateLimitError" })).toBe("rate_limit");
    expect(stripeOutcome({ type: "StripeConnectionError" })).toBe("connection_error");
  });

  it("falls back to a generic outcome for unknown or missing types", () => {
    expect(stripeOutcome({ type: "StripeSomethingNew" })).toBe("error");
    expect(stripeOutcome({})).toBe("error");
    expect(stripeOutcome(undefined)).toBe("error");
    expect(stripeOutcome("boom")).toBe("error");
  });
});

describe("runStripeCall", () => {
  it("records a success with the operation and elapsed time", async () => {
    const record = vi.fn();
    const result = await runStripeCall("paymentIntents.capture", async () => "intent", record);

    expect(result).toBe("intent");
    expect(record).toHaveBeenCalledOnce();
    const [operation, outcome, seconds] = record.mock.calls[0]!;
    expect(operation).toBe("paymentIntents.capture");
    expect(outcome).toBe("success");
    expect(seconds).toBeGreaterThanOrEqual(0);
  });

  it("records the provider outcome and rethrows when the call fails", async () => {
    const record = vi.fn();
    const failure = { type: "StripeCardError", message: "declined" };

    await expect(
      runStripeCall(
        "paymentIntents.create",
        async () => {
          throw failure;
        },
        record,
      ),
    ).rejects.toBe(failure);

    expect(record).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith("paymentIntents.create", "card_error", expect.any(Number));
  });
});
