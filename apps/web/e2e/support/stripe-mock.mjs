import { createHmac, randomUUID } from "node:crypto";
import { createServer } from "node:http";

/**
 * A small local stand-in for the parts of Stripe this product calls.
 *
 * Two surfaces:
 *  - `/v1/*`     — the Stripe REST API shape the API's SDK uses (PaymentIntents, refunds).
 *  - `/__mock/*` — test control used by the stubbed Stripe.js in `fake-stripe-js.js`.
 *
 * When a card succeeds the mock signs a real `payment_intent.succeeded` webhook with the shared
 * `E2E_STRIPE_WEBHOOK_SECRET` and posts it to the API, so the booking is confirmed by the same
 * code path production uses. It never contacts Stripe and it is bound to loopback only.
 */

const port = Number(process.env.E2E_STRIPE_MOCK_PORT ?? 12111);
const webhookSecret = process.env.E2E_STRIPE_WEBHOOK_SECRET ?? "whsec_e2e_playwright_mock";
const apiPort = Number(process.env.E2E_API_PORT ?? 5001);
const webhookUrl = `http://localhost:${apiPort}/webhooks/stripe`;

const SUCCEEDED_CARD = "4242424242424242";
const DECLINED_CARD = "4000000000000002";
const REQUIRES_ACTION_CARD = "4000000000003220";

/** PaymentIntents keyed by id, plus lookup tables for client secrets and idempotency keys. */
const paymentIntents = new Map();
const paymentIntentBySecret = new Map();
const paymentIntentByIdempotencyKey = new Map();
const refunds = new Map();
let sequence = 0;

/**
 * Webhook delivery is synchronous by default, which is faster than any browser assertion. A spec
 * that needs to see the pre-webhook "Confirming" state holds deliveries first, then releases them.
 */
let holdDeliveries = false;
const heldDeliveries = [];

const json = (res, status, payload) => {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
  });
  res.end(body);
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });

const parseForm = (body) => {
  const form = new URLSearchParams(body);
  const metadata = {};
  for (const [key, value] of form) {
    const match = /^metadata\[(.+)]$/.exec(key);
    if (match) metadata[match[1]] = value;
  }
  return { form, metadata };
};

/** Sends a correctly signed event to the API and retries briefly while the API finishes booting. */
const deliver = async (type, object) => {
  const event = {
    id: `evt_mock_${randomUUID()}`,
    object: "event",
    api_version: "2025-01-01",
    created: Math.floor(Date.now() / 1000),
    type,
    data: { object },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
  };
  const payload = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", webhookSecret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");

  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "stripe-signature": `t=${timestamp},v1=${signature}`,
        },
        body: payload,
      });
      if (response.ok) return;
      lastError = new Error(`webhook responded ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError;
};

/** Queues a webhook while a spec holds deliveries, otherwise sends it immediately. */
const dispatch = async (type, object) => {
  if (holdDeliveries) {
    heldDeliveries.push({ type, object });
    return;
  }
  await deliver(type, object);
};

const createPaymentIntent = (form, metadata, idempotencyKey) => {
  sequence += 1;
  const id = `pi_mock_${String(sequence).padStart(6, "0")}`;
  const clientSecret = `${id}_secret_mock`;
  const intent = {
    id,
    object: "payment_intent",
    amount: Number(form.get("amount") ?? 0),
    amount_received: 0,
    currency: (form.get("currency") ?? "gbp").toLowerCase(),
    status: "requires_payment_method",
    client_secret: clientSecret,
    capture_method: form.get("capture_method") ?? "automatic",
    metadata,
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    last_payment_error: null,
  };
  paymentIntents.set(id, intent);
  paymentIntentBySecret.set(clientSecret, intent);
  if (idempotencyKey) paymentIntentByIdempotencyKey.set(idempotencyKey, intent);
  return intent;
};

const handleStripeApi = async (req, res, pathname, query, body) => {
  if (req.method === "POST" && pathname === "/v1/payment_intents") {
    const idempotencyKey = req.headers["idempotency-key"];
    if (typeof idempotencyKey === "string" && paymentIntentByIdempotencyKey.has(idempotencyKey)) {
      return json(res, 200, paymentIntentByIdempotencyKey.get(idempotencyKey));
    }
    const { form, metadata } = parseForm(body);
    return json(res, 200, createPaymentIntent(form, metadata, idempotencyKey));
  }

  const intentMatch = /^\/v1\/payment_intents\/([^/]+)(\/capture)?$/.exec(pathname);
  if (intentMatch) {
    const intent = paymentIntents.get(intentMatch[1]);
    if (!intent) {
      return json(res, 404, {
        error: {
          type: "invalid_request_error",
          code: "resource_missing",
          message: "No such intent",
        },
      });
    }

    if (!intentMatch[2] && req.method === "GET") return json(res, 200, intent);

    if (intentMatch[2] && req.method === "POST") {
      const { form } = parseForm(body);
      intent.status = "succeeded";
      intent.amount_received = Number(form.get("amount_to_capture") ?? intent.amount);
      await dispatch("payment_intent.succeeded", intent);
      return json(res, 200, intent);
    }
  }

  if (req.method === "POST" && pathname === "/v1/refunds") {
    const { form } = parseForm(body);
    sequence += 1;
    const refund = {
      id: `re_mock_${String(sequence).padStart(6, "0")}`,
      object: "refund",
      amount: Number(form.get("amount") ?? 0),
      currency: "gbp",
      payment_intent: form.get("payment_intent"),
      status: "succeeded",
      created: Math.floor(Date.now() / 1000),
    };
    refunds.set(refund.id, refund);
    return json(res, 200, refund);
  }

  return json(res, 404, {
    error: {
      type: "invalid_request_error",
      code: "resource_missing",
      message: `The local Stripe mock does not implement ${req.method} ${pathname}${query}`,
    },
  });
};

const handleControl = async (req, res, pathname, body) => {
  if (req.method === "GET" && pathname === "/health") {
    return json(res, 200, { status: "ok", paymentIntents: paymentIntents.size });
  }

  if (req.method === "GET" && pathname === "/__mock/payment-intents") {
    return json(res, 200, { paymentIntents: [...paymentIntents.values()] });
  }

  if (req.method === "GET" && pathname === "/__mock/refunds") {
    return json(res, 200, { refunds: [...refunds.values()] });
  }

  if (req.method === "POST" && pathname === "/__mock/reset") {
    paymentIntents.clear();
    paymentIntentBySecret.clear();
    paymentIntentByIdempotencyKey.clear();
    refunds.clear();
    holdDeliveries = false;
    heldDeliveries.length = 0;
    sequence = 0;
    return json(res, 200, { reset: true });
  }

  if (req.method === "POST" && pathname === "/__mock/hold-webhooks") {
    holdDeliveries = true;
    return json(res, 200, { holding: true });
  }

  if (req.method === "POST" && pathname === "/__mock/release-webhooks") {
    holdDeliveries = false;
    const held = heldDeliveries.splice(0, heldDeliveries.length);
    for (const delivery of held) {
      await deliver(delivery.type, delivery.object);
    }
    return json(res, 200, { delivered: held.length });
  }

  if (req.method === "POST" && pathname === "/__mock/confirm") {
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      return json(res, 400, { error: { message: "Expected a JSON body" } });
    }

    const intent = paymentIntentBySecret.get(payload?.clientSecret);
    if (!intent) {
      return json(res, 404, {
        error: { type: "invalid_request_error", message: "Unknown client secret" },
      });
    }
    if (intent.status === "succeeded") return json(res, 200, { paymentIntent: intent });

    const number = String(payload?.card?.number ?? "").replace(/\D/g, "");

    if (number === DECLINED_CARD) {
      intent.last_payment_error = {
        type: "card_error",
        code: "card_declined",
        decline_code: "generic_decline",
        message: "Your card was declined.",
      };
      await dispatch("payment_intent.payment_failed", intent);
      return json(res, 200, {
        error: intent.last_payment_error,
      });
    }

    if (number === REQUIRES_ACTION_CARD) {
      // Mimics an interrupted 3-D Secure challenge: the outcome is genuinely unknown.
      intent.status = "requires_action";
      return json(res, 200, { paymentIntent: intent });
    }

    if (number !== SUCCEEDED_CARD) {
      return json(res, 200, {
        error: {
          type: "card_error",
          code: "incorrect_number",
          message: "Your card number is incorrect.",
        },
      });
    }

    intent.status = "succeeded";
    intent.amount_received = intent.amount;
    intent.payment_method = "pm_mock_visa";
    try {
      await dispatch("payment_intent.succeeded", intent);
    } catch (error) {
      return json(res, 502, {
        error: {
          type: "api_error",
          message: `The local Stripe mock could not deliver the webhook: ${String(error)}`,
        },
      });
    }
    return json(res, 200, { paymentIntent: intent });
  }

  return json(res, 404, { error: { message: `Unknown mock endpoint ${pathname}` } });
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);
  const body = req.method === "GET" || req.method === "HEAD" ? "" : await readBody(req);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "GET, POST, OPTIONS",
    });
    return res.end();
  }

  try {
    if (url.pathname.startsWith("/v1/")) {
      return await handleStripeApi(req, res, url.pathname, url.search, body);
    }
    return await handleControl(req, res, url.pathname, body);
  } catch (error) {
    console.error(`[stripe-mock] ${req.method} ${url.pathname} failed:`, error);
    return json(res, 500, { error: { message: "Local Stripe mock failed" } });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`[stripe-mock] listening on http://localhost:${port}`);
});
