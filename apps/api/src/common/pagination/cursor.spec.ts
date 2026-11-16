import { describe, expect, it } from "vitest";
import { ValidationFailedException } from "../errors/validation-failed.exception";
import { decodeCursor, encodeCursor } from "./cursor";

describe("cursor codec", () => {
  it("round-trips the sort key and id", () => {
    const cursor = { key: "2026-11-16T10:00:00.000Z", id: "0f8fad5b-d9cb-469f-a165-70867728950e" };

    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it("produces an opaque, URL-safe token", () => {
    const encoded = encodeCursor({ key: "a", id: "b" });

    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encoded).not.toContain("a");
  });

  it.each([
    ["not base64 at all", "%%%"],
    ["valid base64 but not JSON", Buffer.from("nope").toString("base64url")],
    [
      "JSON but not a cursor",
      Buffer.from(JSON.stringify({ key: "a", id: "b" })).toString("base64url"),
    ],
    ["an unknown version", Buffer.from(JSON.stringify([2, "a", "b"])).toString("base64url")],
    ["missing segments", Buffer.from(JSON.stringify([1, "a"])).toString("base64url")],
    ["non-string fields", Buffer.from(JSON.stringify([1, 2, 3])).toString("base64url")],
  ])("rejects %s", (_name, raw) => {
    expect(() => decodeCursor(raw)).toThrowError(ValidationFailedException);

    try {
      decodeCursor(raw);
    } catch (error) {
      expect((error as ValidationFailedException).fieldErrors).toEqual([
        { field: "cursor", message: "Invalid cursor" },
      ]);
    }
  });
});
