import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  hashIdempotentRequest,
  idempotencyScope,
  isValidIdempotencyKey,
} from "./idempotency.utils";

describe("idempotency utilities", () => {
  it("canonicalizes object keys recursively", () => {
    expect(canonicalJson({ b: 2, a: { d: 4, c: 3 } })).toBe('{"a":{"c":3,"d":4},"b":2}');
  });

  it("hashes equivalent payloads identically and different payloads differently", () => {
    const first = hashIdempotentRequest({
      method: "POST",
      baseUrl: "/api/v1/bookings",
      route: "/",
      body: { b: 2, a: 1 },
    });
    const reordered = hashIdempotentRequest({
      method: "POST",
      baseUrl: "/api/v1/bookings",
      route: "/",
      body: { a: 1, b: 2 },
    });
    const changed = hashIdempotentRequest({
      method: "POST",
      baseUrl: "/api/v1/bookings",
      route: "/",
      body: { a: 1, b: 3 },
    });

    expect(first).toBe(reordered);
    expect(changed).not.toBe(first);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it("separates scopes by principal", () => {
    expect(idempotencyScope("bookings.create", "user-1")).toBe("bookings.create:user-1");
    expect(idempotencyScope("bookings.create", "user-1")).not.toBe(
      idempotencyScope("bookings.create", "user-2"),
    );
  });

  it("validates key length and control characters", () => {
    expect(isValidIdempotencyKey("abc-123")).toBe(true);
    expect(isValidIdempotencyKey("")).toBe(false);
    expect(isValidIdempotencyKey("x".repeat(256))).toBe(false);
    expect(isValidIdempotencyKey("bad\nkey")).toBe(false);
  });
});
