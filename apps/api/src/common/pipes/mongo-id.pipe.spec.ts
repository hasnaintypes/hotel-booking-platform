import { describe, expect, it } from "vitest";
import { ValidationFailedException } from "../errors/validation-failed.exception";
import { MongoIdPipe } from "./mongo-id.pipe";

describe("MongoIdPipe", () => {
  const pipe = new MongoIdPipe();

  it("accepts a 24-character hex id", () => {
    expect(pipe.transform("64b7f0f0f0f0f0f0f0f0f0f0")).toBe("64b7f0f0f0f0f0f0f0f0f0f0");
    expect(pipe.transform("64B7F0F0F0F0F0F0F0F0F0F0")).toBe("64B7F0F0F0F0F0F0F0F0F0F0");
  });

  it.each([
    ["too short", "abc"],
    ["a 12-character string", "abcdefghijkl"],
    ["non-hex characters", "zzzzzzzzzzzzzzzzzzzzzzzz"],
    ["an empty string", ""],
    ["an object", { $ne: null }],
    ["an array", ["64b7f0f0f0f0f0f0f0f0f0f0"]],
    ["undefined", undefined],
  ])("rejects %s", (_name, value) => {
    expect(() => pipe.transform(value)).toThrow(ValidationFailedException);
  });

  it("names the parameter in the field error", () => {
    try {
      pipe.transform("nope", { type: "param", data: "hotelId" });
      expect.unreachable();
    } catch (error) {
      expect((error as ValidationFailedException).fieldErrors).toEqual([
        { field: "hotelId", message: "must be a valid id" },
      ]);
    }
  });
});
