import { describe, expect, it } from "vitest";
import { isCommonPassword } from "./password-policy";

describe("isCommonPassword", () => {
  it.each([
    "1234567890",
    "qwertyuiop",
    "password123",
    "Password123",
    "PASSWORD1234",
    "iloveyou123",
    "letmein1234",
    "welcome123",
    "admin123456",
    "1q2w3e4r5t",
  ])("rejects the well-known password %s, whatever its case", (password) => {
    expect(isCommonPassword(password)).toBe(true);
  });

  it.each(["aaaaaaaaaaaa", "0000000000", "zzzzzzzzzzzzzz"])(
    "rejects one character repeated: %s",
    (password) => {
      expect(isCommonPassword(password)).toBe(true);
    },
  );

  it.each(["abcdefghijkl", "0123456789", "9876543210", "zyxwvutsrq"])(
    "rejects a plain run: %s",
    (password) => {
      expect(isCommonPassword(password)).toBe(true);
    },
  );

  it("rejects a password equal to the name part of the account's email", () => {
    expect(isCommonPassword("alexandria.smith", "alexandria.smith@example.test")).toBe(true);
    expect(isCommonPassword("Alexandria.Smith", "alexandria.smith@example.test")).toBe(true);
  });

  it("does not compare against a very short email name", () => {
    expect(isCommonPassword("abc", "abc@example.test")).toBe(false);
  });

  it.each([
    "correct-horse-battery-staple",
    "tulip-Harbour-92",
    "k9#Lm2$vQz!x",
    "my dog's name is Biscuit",
    "1234-lots-of-words-5678",
  ])("accepts %s", (password) => {
    expect(isCommonPassword(password, "someone@example.test")).toBe(false);
  });
});
