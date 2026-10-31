import type { PaymentIntentResult } from "@stripe/stripe-js";
import { describe, expect, it } from "vitest";
import { interpretPaymentResult, NETWORK_FAILURE } from "./payment-result";

const asResult = (value: unknown) => value as PaymentIntentResult;

describe("interpretPaymentResult", () => {
  it("reports success with the payment intent id", () => {
    const outcome = interpretPaymentResult(
      asResult({ paymentIntent: { id: "pi_1", status: "succeeded" } }),
    );
    expect(outcome).toEqual({ kind: "succeeded", paymentIntentId: "pi_1" });
  });

  it("passes Stripe's customer-facing message for a declined card", () => {
    const outcome = interpretPaymentResult(
      asResult({
        error: { type: "card_error", code: "card_declined", message: "Your card was declined." },
      }),
    );
    expect(outcome).toEqual({ kind: "failed", message: "Your card was declined." });
  });

  it("passes the message for a validation error", () => {
    const outcome = interpretPaymentResult(
      asResult({ error: { type: "validation_error", message: "Your card number is incomplete." } }),
    );
    expect(outcome).toEqual({ kind: "failed", message: "Your card number is incomplete." });
  });

  it("explains a connection error", () => {
    const outcome = interpretPaymentResult(asResult({ error: { type: "api_connection_error" } }));
    expect(outcome).toEqual({ kind: "failed", message: NETWORK_FAILURE });
  });

  it("hides the details of unexpected Stripe errors", () => {
    const outcome = interpretPaymentResult(
      asResult({ error: { type: "api_error", message: "internal detail req_123" } }),
    );
    expect(outcome.kind).toBe("failed");
    expect(JSON.stringify(outcome)).not.toContain("req_123");
  });

  it("treats a payment that needs more action as not completed", () => {
    const outcome = interpretPaymentResult(
      asResult({ paymentIntent: { id: "pi_1", status: "requires_action" } }),
    );
    expect(outcome).toMatchObject({
      kind: "failed",
      message: expect.stringMatching(/wasn't completed/),
    });
  });

  it("asks the guest not to pay again while a payment is processing", () => {
    const outcome = interpretPaymentResult(
      asResult({ paymentIntent: { id: "pi_1", status: "processing" } }),
    );
    expect(outcome).toMatchObject({
      kind: "pending",
      message: expect.stringMatching(/don't pay again/),
    });
  });

  it("reports a cancelled payment", () => {
    const outcome = interpretPaymentResult(
      asResult({ paymentIntent: { id: "pi_1", status: "canceled" } }),
    );
    expect(outcome).toMatchObject({ kind: "failed", message: expect.stringMatching(/cancelled/) });
  });

  it("fails safely when Stripe returns neither an error nor a payment intent", () => {
    expect(interpretPaymentResult(asResult({})).kind).toBe("failed");
  });
});
