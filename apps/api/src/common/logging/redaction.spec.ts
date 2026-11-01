import pino from "pino";
import { describe, expect, it } from "vitest";
import { REDACT_CENSOR, REDACT_PATHS, pathOnly, scrubSecrets } from "./redaction";
import { resolveRequestId } from "./request-id";

describe("scrubSecrets", () => {
  it("removes credentials from URLs", () => {
    expect(scrubSecrets("failed: mongodb+srv://admin:p%40ss@cluster0.example.net/db")).toBe(
      "failed: mongodb+srv://[Redacted]@cluster0.example.net/db",
    );
    expect(scrubSecrets("GET https://token123@api.example.test/v1")).toBe(
      "GET https://[Redacted]@api.example.test/v1",
    );
  });
  it("leaves text without credentials unchanged", () => {
    expect(scrubSecrets("connect ECONNREFUSED 127.0.0.1:27017")).toBe(
      "connect ECONNREFUSED 127.0.0.1:27017",
    );
  });
});

describe("pathOnly", () => {
  it("drops the query string", () => {
    expect(pathOnly("/api/hotels?token=abc&x=1")).toBe("/api/hotels");
    expect(pathOnly("/api/hotels")).toBe("/api/hotels");
    expect(pathOnly(undefined)).toBe("");
  });
});

describe("resolveRequestId", () => {
  it("accepts safe ids and replaces unsafe ones", () => {
    expect(resolveRequestId("abc-12345678")).toBe("abc-12345678");
    expect(resolveRequestId(["abc-12345678", "other"])).toBe("abc-12345678");
    for (const bad of [
      undefined,
      "",
      "short",
      "has space inside",
      "line\nbreak-123456",
      "x".repeat(129),
    ]) {
      expect(resolveRequestId(bad as string)).toMatch(/^[0-9a-f-]{36}$/);
    }
  });
});

describe("redaction config", () => {
  it("covers the sensitive headers and fields we promise never to log", () => {
    expect(REDACT_PATHS).toEqual(
      expect.arrayContaining([
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers['x-api-key']",
        "req.headers['stripe-signature']",
        "res.headers['set-cookie']",
        "*.password",
        "*.token",
        "*.secret",
        "*.cardNumber",
        "*.cvc",
      ]),
    );
  });

  it("redacts representative values with pino", () => {
    let output = "";
    const stream = { write: (chunk: string) => void (output += chunk) };
    const logger = pino({ redact: { paths: REDACT_PATHS, censor: REDACT_CENSOR } }, stream);

    logger.info(
      {
        req: {
          headers: {
            authorization: "Bearer bearer-secret",
            cookie: "sid=cookie-secret",
            "x-api-key": "api-key-secret",
            "stripe-signature": "signature-secret",
          },
        },
        res: { headers: { "set-cookie": ["sid=set-cookie-secret"] } },
        user: {
          password: "password-secret",
          token: "token-secret",
          secret: "client-secret",
          cardNumber: "4242424242424242",
          cvc: "123",
        },
      },
      "redaction check",
    );

    for (const secret of [
      "bearer-secret",
      "cookie-secret",
      "api-key-secret",
      "signature-secret",
      "set-cookie-secret",
      "password-secret",
      "token-secret",
      "client-secret",
      "4242424242424242",
    ]) {
      expect(output).not.toContain(secret);
    }
    expect(output).toContain(REDACT_CENSOR);
  });
});
