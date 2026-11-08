import { beforeEach, describe, expect, it } from "vitest";
import { clearIdempotencyKey, idempotencyHeaders, idempotencyKeyFor } from "./idempotency";

describe("idempotency keys", () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearIdempotencyKey("checkout:1");
    clearIdempotencyKey("checkout:2");
    clearIdempotencyKey("cancel:1");
  });

  it("reuses one key for the same checkout session", () => {
    const first = idempotencyKeyFor("checkout:1");
    expect(idempotencyKeyFor("checkout:1")).toBe(first);
    expect(idempotencyHeaders("checkout:1")).toEqual({ "Idempotency-Key": first });
  });

  it("uses a different key per session", () => {
    expect(idempotencyKeyFor("checkout:1")).not.toBe(idempotencyKeyFor("checkout:2"));
  });

  it("generates a fresh key after the session is cleared", () => {
    const first = idempotencyKeyFor("cancel:1");
    clearIdempotencyKey("cancel:1");
    expect(idempotencyKeyFor("cancel:1")).not.toBe(first);
  });

  it("survives a reload by reading the key from sessionStorage", () => {
    const key = idempotencyKeyFor("checkout:1");
    expect(sessionStorage.getItem("hotel-booking:idempotency:checkout:1")).toBe(key);
  });
});
