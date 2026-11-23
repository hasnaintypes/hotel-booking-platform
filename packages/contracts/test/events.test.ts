import { describe, expect, it } from "vitest";
import {
  JOB_TOPIC_VALUES,
  isJobTopic,
  jobPayloadSchemas,
  jobTopicSchema,
  parseJobPayload,
  stripeWebhookEventSchema,
} from "../src";

const UUID = "0f8fad5b-d9cb-469f-a165-70867728950e";

const event = (type: string, object: Record<string, unknown>) => ({
  id: `evt_${type}`,
  object: "event",
  api_version: "2025-01-01",
  created: 1_700_000_000,
  livemode: false,
  pending_webhooks: 1,
  request: { id: null, idempotency_key: null },
  type,
  data: { object },
});

describe("job payload contracts", () => {
  it("accepts the empty payload for every topic", () => {
    for (const topic of JOB_TOPIC_VALUES) {
      expect(jobTopicSchema.parse(topic)).toBe(topic);
      expect(jobPayloadSchemas[topic].parse({})).toEqual({});
      expect(parseJobPayload(topic, {})).toEqual({});
    }
  });

  it("rejects non-object and unknown-key payloads for every topic", () => {
    for (const topic of JOB_TOPIC_VALUES) {
      for (const payload of [null, undefined, 1, "payload", [], { value: 1 }]) {
        expect(jobPayloadSchemas[topic].safeParse(payload).success).toBe(false);
        expect(() => parseJobPayload(topic, payload)).toThrow(topic);
      }
    }
  });

  it("leaves queue names outside the contract vocabulary alone", () => {
    expect(isJobTopic("test.jobs.arbitrary")).toBe(false);
    expect(jobTopicSchema.safeParse("test.jobs.arbitrary").success).toBe(false);
    expect(parseJobPayload("test.jobs.arbitrary", { value: 1 })).toEqual({ value: 1 });
  });
});

describe("stripeWebhookEventSchema", () => {
  it("parses a minimal event and preserves every unknown field", () => {
    const payload = event("customer.created", {
      id: "cus_1",
      object: "customer",
      email: "grace@example.test",
    });

    const parsed = stripeWebhookEventSchema.parse(payload);

    expect(parsed).toEqual(payload);
    expect(parsed.api_version).toBe("2025-01-01");
    expect(parsed.data.object.email).toBe("grace@example.test");
  });

  it("requires the envelope id, type and data.object", () => {
    expect(
      stripeWebhookEventSchema.safeParse({
        type: "customer.created",
        data: { object: { id: "cus_1" } },
      }).success,
    ).toBe(false);
    expect(
      stripeWebhookEventSchema.safeParse({
        id: "evt_1",
        data: { object: { id: "cus_1" } },
      }).success,
    ).toBe(false);
    expect(
      stripeWebhookEventSchema.safeParse({ id: "evt_1", type: "customer.created" }).success,
    ).toBe(false);
    expect(
      stripeWebhookEventSchema.safeParse({ id: "evt_1", type: "customer.created", data: {} })
        .success,
    ).toBe(false);
    expect(
      stripeWebhookEventSchema.safeParse({
        id: "evt_1",
        type: "customer.created",
        data: { object: {} },
      }).success,
    ).toBe(false);
  });

  it("parses a successful PaymentIntent", () => {
    const parsed = stripeWebhookEventSchema.parse(
      event("payment_intent.succeeded", {
        id: "pi_1",
        object: "payment_intent",
        amount: 10_000,
        amount_received: 10_000,
        status: "succeeded",
        metadata: { bookingId: UUID },
      }),
    );

    expect(parsed.data.object).toMatchObject({
      id: "pi_1",
      amount: 10_000,
      amount_received: 10_000,
      metadata: { bookingId: UUID },
    });
  });

  it("parses a capturable PaymentIntent", () => {
    const parsed = stripeWebhookEventSchema.parse(
      event("payment_intent.amount_capturable_updated", {
        id: "pi_2",
        object: "payment_intent",
        amount_capturable: 10_000,
        status: "requires_capture",
      }),
    );

    expect(parsed.data.object).toMatchObject({
      id: "pi_2",
      amount_capturable: 10_000,
      status: "requires_capture",
    });
  });

  it("parses a failed PaymentIntent with its last error", () => {
    const parsed = stripeWebhookEventSchema.parse(
      event("payment_intent.payment_failed", {
        id: "pi_3",
        object: "payment_intent",
        status: "requires_payment_method",
        last_payment_error: { code: "card_declined", message: "Your card was declined." },
      }),
    );

    expect(parsed.data.object.last_payment_error).toEqual({
      code: "card_declined",
      message: "Your card was declined.",
    });
  });

  it("parses a canceled PaymentIntent", () => {
    const parsed = stripeWebhookEventSchema.parse(
      event("payment_intent.canceled", {
        id: "pi_4",
        object: "payment_intent",
        status: "canceled",
      }),
    );

    expect(parsed.data.object.status).toBe("canceled");
  });

  it("parses a refunded charge with an empty refunds list and a string PaymentIntent", () => {
    const parsed = stripeWebhookEventSchema.parse(
      event("charge.refunded", {
        id: "ch_1",
        object: "charge",
        payment_intent: "pi_5",
        amount_refunded: 0,
        refunds: { object: "list", data: [] },
      }),
    );

    expect(parsed.data.object.payment_intent).toBe("pi_5");
    expect(parsed.data.object.refunds?.data).toEqual([]);
  });

  it("parses a refunded charge with succeeded refunds", () => {
    const parsed = stripeWebhookEventSchema.parse(
      event("charge.refunded", {
        id: "ch_2",
        object: "charge",
        payment_intent: "pi_6",
        amount_refunded: 4_000,
        refunds: {
          object: "list",
          data: [
            {
              id: "re_1",
              object: "refund",
              status: "succeeded",
              amount: 4_000,
              currency: "gbp",
            },
          ],
        },
      }),
    );

    expect(parsed.data.object.refunds?.data).toMatchObject([
      { id: "re_1", status: "succeeded", amount: 4_000 },
    ]);
  });

  it("parses a dispute with a string PaymentIntent", () => {
    const parsed = stripeWebhookEventSchema.parse(
      event("charge.dispute.created", {
        id: "dp_1",
        object: "dispute",
        payment_intent: "pi_7",
        amount: 10_000,
        currency: "gbp",
        status: "needs_response",
      }),
    );

    expect(parsed.data.object).toMatchObject({
      id: "dp_1",
      payment_intent: "pi_7",
      amount: 10_000,
      currency: "gbp",
    });
  });

  it("accepts a PaymentIntent supplied as an expanded object", () => {
    const parsed = stripeWebhookEventSchema.parse(
      event("charge.refunded", {
        id: "ch_3",
        object: "charge",
        payment_intent: { id: "pi_8", object: "payment_intent" },
        amount_refunded: 0,
        refunds: { data: [] },
      }),
    );

    expect(parsed.data.object.payment_intent).toMatchObject({ id: "pi_8" });
  });
});
