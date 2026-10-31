import { describe, expect, it } from "vitest";
import { escapeRegExp } from "./escape-regexp";

describe("escapeRegExp", () => {
  it("leaves plain text alone", () => {
    expect(escapeRegExp("New York")).toBe("New York");
  });

  it.each([".", "*", "+", "?", "^", "$", "{", "}", "(", ")", "|", "[", "]", "\\"])(
    "escapes %s so it matches literally",
    (char) => {
      expect(new RegExp(escapeRegExp(char)).test(char)).toBe(true);
      expect(new RegExp(`^${escapeRegExp(char)}$`).test("x")).toBe(false);
    },
  );

  it("turns a pattern into a literal that cannot match anything else", () => {
    const pattern = new RegExp(escapeRegExp(".*"), "i");
    expect(pattern.test("London")).toBe(false);
    expect(pattern.test("a.*b")).toBe(true);
  });

  it("neutralises a catastrophic-backtracking pattern", () => {
    const pattern = new RegExp(escapeRegExp("(a+)+$"));
    expect(pattern.test("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!")).toBe(false);
  });
});
