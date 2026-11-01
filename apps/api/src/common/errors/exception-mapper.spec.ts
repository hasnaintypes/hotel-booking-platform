import {
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { CORS_REJECTION_MESSAGE, mapException } from "./exception-mapper";
import { RateLimitedException } from "./rate-limited.exception";
import { ValidationFailedException } from "./validation-failed.exception";

const tagged = (props: Record<string, unknown>, message = "internal detail") =>
  Object.assign(new Error(message), props);

describe("mapException", () => {
  it.each([
    ["not found", new NotFoundException("Hotel not found"), 404, "NOT_FOUND", "Hotel not found"],
    [
      "conflict",
      new ConflictException("User already exists"),
      409,
      "CONFLICT",
      "User already exists",
    ],
    ["forbidden", new ForbiddenException("Access denied"), 403, "FORBIDDEN", "Access denied"],
    ["teapot (unmapped http status)", new HttpException("brew", 418), 418, "BAD_REQUEST", "brew"],
  ])("maps %s with its own message", (_name, error, status, code, detail) => {
    expect(mapException(error)).toMatchObject({ status, code, detail });
  });

  it("maps a rate-limit exception to 429 with a Retry-After header", () => {
    const mapped = mapException(new RateLimitedException("Slow down", 12.2));
    expect(mapped).toMatchObject({
      status: 429,
      code: "TOO_MANY_REQUESTS",
      detail: "Slow down",
      headers: { "Retry-After": "13" },
    });
  });

  it("never reports a Retry-After of less than one second", () => {
    expect(mapException(new RateLimitedException("Slow down", 0)).headers).toEqual({
      "Retry-After": "1",
    });
  });

  it("maps the CORS rejection to 403 with its own code", () => {
    const mapped = mapException(new ForbiddenException(CORS_REJECTION_MESSAGE));
    expect(mapped).toMatchObject({ status: 403, code: "CORS_ORIGIN_NOT_ALLOWED" });
  });

  it("exposes field errors for validation failures", () => {
    const mapped = mapException(
      new ValidationFailedException([{ field: "email", message: "email must be an email" }]),
    );
    expect(mapped).toMatchObject({ status: 400, code: "VALIDATION_FAILED" });
    expect(mapped.errors).toEqual([{ field: "email", message: "email must be an email" }]);
  });

  it("hides the message of deliberate 5xx exceptions", () => {
    const upstream = mapException(
      new BadGatewayException("stripe said: key sk_live_abc is invalid"),
    );
    const down = mapException(
      new ServiceUnavailableException("AI assist is disabled (set FLAG=true)"),
    );
    for (const mapped of [upstream, down]) {
      expect(mapped.detail).not.toMatch(/sk_live|FLAG/);
    }
    expect(upstream).toMatchObject({ status: 502, code: "UPSTREAM_ERROR" });
    expect(down).toMatchObject({ status: 503, code: "SERVICE_UNAVAILABLE" });
  });

  it.each([
    ["invalid JSON", { type: "entity.parse.failed" }, 400, "INVALID_JSON"],
    ["body too large", { type: "entity.too.large" }, 413, "PAYLOAD_TOO_LARGE"],
    ["unsupported charset", { type: "charset.unsupported" }, 415, "UNSUPPORTED_MEDIA_TYPE"],
    [
      "upload too large",
      { name: "MulterError", code: "LIMIT_FILE_SIZE" },
      413,
      "PAYLOAD_TOO_LARGE",
    ],
    [
      "unexpected upload field",
      { name: "MulterError", code: "LIMIT_UNEXPECTED_FILE" },
      400,
      "BAD_REQUEST",
    ],
    ["duplicate key", { name: "MongoServerError", code: 11000 }, 409, "CONFLICT"],
    ["cast error", { name: "CastError" }, 400, "INVALID_ID"],
    ["card declined", { type: "StripeCardError" }, 402, "PAYMENT_DECLINED"],
    ["stripe connection", { type: "StripeConnectionError" }, 502, "UPSTREAM_ERROR"],
    ["stripe rate limit", { type: "StripeRateLimitError" }, 503, "SERVICE_UNAVAILABLE"],
    ["http-errors client status", { status: 431 }, 431, "BAD_REQUEST"],
  ])("maps %s", (_name, props, status, code) => {
    expect(mapException(tagged(props))).toMatchObject({ status, code });
  });

  it("maps mongoose validation errors to 422 with fields", () => {
    const mapped = mapException(
      tagged({
        name: "ValidationError",
        errors: { rating: { path: "rating", message: "too high" } },
      }),
    );
    expect(mapped).toMatchObject({ status: 422, code: "UNPROCESSABLE" });
    expect(mapped.errors).toEqual([{ field: "rating", message: "too high" }]);
  });

  it("never exposes the message of unexpected errors", () => {
    const mapped = mapException(new Error("db password is hunter2"));
    expect(mapped).toMatchObject({ status: 500, code: "INTERNAL_ERROR" });
    expect(JSON.stringify(mapped)).not.toContain("hunter2");
  });

  it("handles non-error throwables", () => {
    for (const value of [undefined, null, "string failure", 42, {}]) {
      expect(mapException(value).status).toBe(500);
    }
  });
});
