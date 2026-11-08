import { describe, expect, it } from "vitest";
import { validateEnv } from "./env.validation";

const base = {
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

  describe("AI limits", () => {
    it("accepts values inside the allowed ranges", () => {
      expect(() =>
        validateEnv({
          ...base,
          AI_DAILY_QUOTA: "20",
          AI_PER_MINUTE_LIMIT: "5",
          AI_REQUEST_DEADLINE_MS: "30000",
        }),
      ).not.toThrow();
    });

    it.each([
      ["AI_DAILY_QUOTA", "0"],
      ["AI_DAILY_QUOTA", "10001"],
      ["AI_DAILY_QUOTA", "many"],
      ["AI_PER_MINUTE_LIMIT", "0"],
      ["AI_PER_MINUTE_LIMIT", "601"],
      ["AI_REQUEST_DEADLINE_MS", "500"],
      ["AI_REQUEST_DEADLINE_MS", "120001"],
      ["AI_REQUEST_DEADLINE_MS", "30s"],
    ])("rejects %s=%s", (name, value) => {
      expect(() => validateEnv({ ...base, [name]: value })).toThrow(new RegExp(name));
    });
  });

  describe("database operations limits", () => {
    it("accepts values inside the allowed ranges", () => {
      expect(() =>
        validateEnv({
          ...base,
          DATABASE_POOL_MAX: "20",
          DATABASE_STATEMENT_TIMEOUT_MS: "5000",
          DATABASE_IDLE_IN_TRANSACTION_TIMEOUT_MS: "10000",
          DATABASE_LOCK_TIMEOUT_MS: "3000",
        }),
      ).not.toThrow();
    });

    it.each([
      ["DATABASE_POOL_MAX", "0"],
      ["DATABASE_POOL_MAX", "101"],
      ["DATABASE_STATEMENT_TIMEOUT_MS", "50"],
      ["DATABASE_STATEMENT_TIMEOUT_MS", "120001"],
      ["DATABASE_IDLE_IN_TRANSACTION_TIMEOUT_MS", "50"],
      ["DATABASE_IDLE_IN_TRANSACTION_TIMEOUT_MS", "600001"],
      ["DATABASE_LOCK_TIMEOUT_MS", "50"],
      ["DATABASE_LOCK_TIMEOUT_MS", "120001"],
      ["DATABASE_LOCK_TIMEOUT_MS", "3s"],
    ])("rejects %s=%s", (name, value) => {
      expect(() => validateEnv({ ...base, [name]: value })).toThrow(new RegExp(name));
    });
  });

  describe("idempotency settings", () => {
    it.each(["24", "48", "72"])("accepts IDEMPOTENCY_TTL_HOURS=%s", (value) => {
      expect(() => validateEnv({ ...base, IDEMPOTENCY_TTL_HOURS: value })).not.toThrow();
    });

    it.each(["23", "73", "0", "48h"])("rejects IDEMPOTENCY_TTL_HOURS=%s", (value) => {
      expect(() => validateEnv({ ...base, IDEMPOTENCY_TTL_HOURS: value })).toThrow(
        /IDEMPOTENCY_TTL_HOURS/,
      );
    });

    it.each(["1000", "30000", "300000"])("accepts IDEMPOTENCY_LOCK_TIMEOUT_MS=%s", (value) => {
      expect(() => validateEnv({ ...base, IDEMPOTENCY_LOCK_TIMEOUT_MS: value })).not.toThrow();
    });

    it.each(["999", "300001", "30s"])("rejects IDEMPOTENCY_LOCK_TIMEOUT_MS=%s", (value) => {
      expect(() => validateEnv({ ...base, IDEMPOTENCY_LOCK_TIMEOUT_MS: value })).toThrow(
        /IDEMPOTENCY_LOCK_TIMEOUT_MS/,
      );
    });
  });

  describe("background job settings", () => {
    it.each(["true", "false", undefined])("accepts RUN_WORKER=%s", (value) => {
      expect(() => validateEnv({ ...base, RUN_WORKER: value })).not.toThrow();
    });

    it.each(["1", "yes", "TRUE"])("rejects RUN_WORKER=%s", (value) => {
      expect(() => validateEnv({ ...base, RUN_WORKER: value })).toThrow(/RUN_WORKER/);
    });

    it("accepts values inside the allowed ranges", () => {
      expect(() =>
        validateEnv({
          ...base,
          JOB_OUTBOX_POLL_MS: "1000",
          JOB_OUTBOX_BATCH_SIZE: "25",
          JOB_OUTBOX_MAX_ATTEMPTS: "10",
          JOB_RETRY_LIMIT: "3",
          JOB_EXPIRE_SECONDS: "900",
          JOB_LOCAL_CONCURRENCY: "5",
          JOB_PAYMENT_HOLD_MINUTES: "30",
        }),
      ).not.toThrow();
    });

    it.each([
      ["JOB_OUTBOX_POLL_MS", "50"],
      ["JOB_OUTBOX_BATCH_SIZE", "501"],
      ["JOB_OUTBOX_MAX_ATTEMPTS", "0"],
      ["JOB_RETRY_LIMIT", "-1"],
      ["JOB_EXPIRE_SECONDS", "0"],
      ["JOB_LOCAL_CONCURRENCY", "101"],
      ["JOB_PAYMENT_HOLD_MINUTES", "0"],
      ["JOB_PAYMENT_HOLD_MINUTES", "30m"],
    ])("rejects %s=%s", (name, value) => {
      expect(() => validateEnv({ ...base, [name]: value })).toThrow(new RegExp(name));
    });
  });

  it("still validates the log settings", () => {
    expect(() => validateEnv({ ...base, LOG_LEVEL: "loud" })).toThrow(/LOG_LEVEL/);
    expect(() => validateEnv({ ...base, LOG_FORMAT: "xml" })).toThrow(/LOG_FORMAT/);
  });
});
