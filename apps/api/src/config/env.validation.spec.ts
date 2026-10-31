import { describe, expect, it } from "vitest";
import { validateEnv } from "./env.validation";

const base = {
  MONGODB_CONNECTION_STRING: "mongodb://localhost:27017/test",
  JWT_SECRET_KEY: "secret",
  CLOUDINARY_CLOUD_NAME: "cloud",
  CLOUDINARY_API_KEY: "key",
  CLOUDINARY_API_SECRET: "secret",
  STRIPE_API_KEY: "sk_test_abc",
};

describe("validateEnv", () => {
  it("accepts a complete environment", () => {
    expect(() => validateEnv(base)).not.toThrow();
  });

  it("lists every missing required variable", () => {
    const { JWT_SECRET_KEY: _jwt, STRIPE_API_KEY: _stripe, ...rest } = base;
    expect(() => validateEnv(rest)).toThrow(/JWT_SECRET_KEY[\s\S]*STRIPE_API_KEY/);
  });

  describe("live Stripe keys in production (until milestone M2)", () => {
    it.each(["sk_live_abc123", "rk_live_abc123"])("refuses %s when NODE_ENV=production", (key) => {
      expect(() => validateEnv({ ...base, NODE_ENV: "production", STRIPE_API_KEY: key })).toThrow(
        /live Stripe key/,
      );
    });

    it("allows a test key in production", () => {
      expect(() => validateEnv({ ...base, NODE_ENV: "production" })).not.toThrow();
    });

    it.each(["development", "test", undefined])(
      "does not block a live key when NODE_ENV is %s",
      (nodeEnv) => {
        expect(() =>
          validateEnv({ ...base, NODE_ENV: nodeEnv, STRIPE_API_KEY: "sk_live_abc123" }),
        ).not.toThrow();
      },
    );
  });

  describe("BOOKING_MAX_NIGHTS", () => {
    it.each(["1", "30", "365"])("accepts %s", (value) => {
      expect(() => validateEnv({ ...base, BOOKING_MAX_NIGHTS: value })).not.toThrow();
    });

    it.each(["0", "366", "-5", "abc", "1.5"])("rejects %s", (value) => {
      expect(() => validateEnv({ ...base, BOOKING_MAX_NIGHTS: value })).toThrow(
        /BOOKING_MAX_NIGHTS/,
      );
    });
  });

  it("still validates the log settings", () => {
    expect(() => validateEnv({ ...base, LOG_LEVEL: "loud" })).toThrow(/LOG_LEVEL/);
    expect(() => validateEnv({ ...base, LOG_FORMAT: "xml" })).toThrow(/LOG_FORMAT/);
  });
});
