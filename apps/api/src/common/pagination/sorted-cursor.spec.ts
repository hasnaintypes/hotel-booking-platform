import { describe, expect, it } from "vitest";
import { ValidationFailedException } from "../errors/validation-failed.exception";
import { encodeCursor } from "./cursor";
import {
  encodeScopedCursor,
  readNumberCursor,
  readTextCursor,
  readTimestampCursor,
} from "./sorted-cursor";

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

const expectInvalidCursor = (run: () => unknown) => {
  expect(run).toThrowError(ValidationFailedException);
  try {
    run();
  } catch (error) {
    expect((error as ValidationFailedException).fieldErrors).toEqual([
      { field: "cursor", message: "Invalid cursor" },
    ]);
  }
};

describe("sorted cursor", () => {
  it("round-trips a timestamp cursor minted for its own scope", () => {
    const key = "2026-11-16T10:00:00.123456Z";

    expect(readTimestampCursor(encodeScopedCursor("hotels:list", key, ID), "hotels:list")).toEqual({
      key,
      id: ID,
      at: new Date(key),
    });
  });

  it("round-trips number and text cursors", () => {
    expect(
      readNumberCursor(
        encodeScopedCursor("hotels:search:price", "7500", ID),
        "hotels:search:price",
      ),
    ).toEqual({ key: "7500", id: ID, value: 7500 });

    expect(
      readTextCursor(encodeScopedCursor("hotels:search:stars", "4", ID), "hotels:search:stars"),
    ).toEqual({ key: "4", id: ID });
  });

  it("treats a missing cursor as the first page", () => {
    expect(readTimestampCursor(undefined, "hotels:list")).toBeUndefined();
  });

  it("rejects a cursor minted for a different ordering", () => {
    const raw = encodeScopedCursor("bookings:mine", "2026-11-16T10:00:00.000000Z", ID);

    expectInvalidCursor(() => readTimestampCursor(raw, "bookings:admin"));
  });

  it("rejects a cursor without a scope", () => {
    const raw = encodeCursor({ key: "2026-11-16T10:00:00.000000Z", id: ID });

    expectInvalidCursor(() => readTimestampCursor(raw, "hotels:list"));
  });

  it.each([
    ["a key of the wrong type", encodeScopedCursor("hotels:list", "not-a-date", ID)],
    ["an empty key", encodeScopedCursor("hotels:list", "", ID)],
    ["an empty id", encodeScopedCursor("hotels:list", "2026-11-16T10:00:00.000000Z", "")],
  ])("rejects %s", (_name, raw) => {
    expectInvalidCursor(() => readTimestampCursor(raw, "hotels:list"));
  });

  it("rejects a number cursor whose key is not a safe integer", () => {
    expectInvalidCursor(() =>
      readNumberCursor(
        encodeScopedCursor("hotels:search:price", "12.5", ID),
        "hotels:search:price",
      ),
    );
  });
});
