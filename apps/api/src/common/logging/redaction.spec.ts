import { describe, expect, it } from "vitest";
import { pathOnly, scrubSecrets } from "./redaction";
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
