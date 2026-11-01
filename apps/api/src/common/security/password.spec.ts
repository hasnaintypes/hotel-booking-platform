import bcrypt from "bcryptjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bcryptCost, DEFAULT_BCRYPT_COST, hashPassword, needsRehash } from "./password";

describe("password hashing", () => {
  afterEach(() => vi.unstubAllEnvs());

  describe("bcryptCost", () => {
    it("is 12 by default", () => {
      vi.stubEnv("BCRYPT_COST", "");
      expect(DEFAULT_BCRYPT_COST).toBe(12);
      expect(bcryptCost()).toBe(12);
    });

    it("can be lowered for tests", () => {
      vi.stubEnv("BCRYPT_COST", "5");
      expect(bcryptCost()).toBe(5);
    });

    it.each(["abc", "3", "16", "7.5", "-1"])("ignores the invalid value %s", (value) => {
      vi.stubEnv("BCRYPT_COST", value);
      expect(bcryptCost()).toBe(12);
    });
  });

  it("hashes with the configured cost and the hash verifies", async () => {
    vi.stubEnv("BCRYPT_COST", "5");

    const hash = await hashPassword("a long enough password");

    expect(bcrypt.getRounds(hash)).toBe(5);
    expect(await bcrypt.compare("a long enough password", hash)).toBe(true);
    expect(await bcrypt.compare("another password", hash)).toBe(false);
  });

  describe("needsRehash", () => {
    it("is true for a hash made with a lower cost", () => {
      vi.stubEnv("BCRYPT_COST", "6");
      expect(needsRehash(bcrypt.hashSync("x", 4))).toBe(true);
    });

    it("is false for a hash at or above the current cost", () => {
      vi.stubEnv("BCRYPT_COST", "5");
      expect(needsRehash(bcrypt.hashSync("x", 5))).toBe(false);
      expect(needsRehash(bcrypt.hashSync("x", 6))).toBe(false);
    });

    it("is false for something that is not a bcrypt hash", () => {
      expect(needsRehash("not a hash")).toBe(false);
      expect(needsRehash("")).toBe(false);
    });
  });
});
