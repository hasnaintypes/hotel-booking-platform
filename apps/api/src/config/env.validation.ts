const REQUIRED_ENV_VARS = [
  "JWT_SECRET_KEY",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "STRIPE_API_KEY",
  "STRIPE_WEBHOOK_SECRET",
] as const;

/** Optional whole-number settings and the range each may take: [name, min, max]. */
const INTEGER_SETTINGS: Array<[string, number, number]> = [
  ["BOOKING_MAX_NIGHTS", 1, 365],
  ["OFFER_TTL_MINUTES", 1, 1_440],
  ["PAYMENT_CLAIM_TIMEOUT_MS", 1_000, 300_000],
  ["STRIPE_WEBHOOK_TOLERANCE_SECONDS", 0, 3_600],
  ["STRIPE_WEBHOOK_FAILURE_ALERT_THRESHOLD", 1, 100],
  ["IDEMPOTENCY_TTL_HOURS", 24, 72],
  ["IDEMPOTENCY_LOCK_TIMEOUT_MS", 1_000, 300_000],
  ["BCRYPT_COST", 4, 15],
  ["AUTH_RATE_LIMIT", 1, 10_000],
  ["AUTH_MAX_FAILED_LOGINS", 1, 100],
  ["AI_DAILY_QUOTA", 1, 10_000],
  ["AI_PER_MINUTE_LIMIT", 1, 600],
  ["AI_REQUEST_DEADLINE_MS", 1_000, 120_000],
  ["DATABASE_POOL_MAX", 1, 100],
  ["DATABASE_STATEMENT_TIMEOUT_MS", 100, 120_000],
  ["DATABASE_IDLE_IN_TRANSACTION_TIMEOUT_MS", 100, 600_000],
  ["DATABASE_LOCK_TIMEOUT_MS", 100, 120_000],
  ["JOB_OUTBOX_POLL_MS", 100, 60_000],
  ["JOB_OUTBOX_BATCH_SIZE", 1, 500],
  ["JOB_OUTBOX_MAX_ATTEMPTS", 1, 100],
  ["JOB_OUTBOX_RETRY_DELAY_MS", 100, 600_000],
  ["JOB_OUTBOX_RETRY_DELAY_MAX_MS", 100, 3_600_000],
  ["JOB_OUTBOX_LOCK_TIMEOUT_MS", 1_000, 3_600_000],
  ["JOB_RETRY_LIMIT", 0, 100],
  ["JOB_RETRY_DELAY_SECONDS", 0, 3_600],
  ["JOB_RETRY_DELAY_MAX_SECONDS", 0, 86_400],
  ["JOB_EXPIRE_SECONDS", 1, 86_400],
  ["JOB_DELETE_AFTER_SECONDS", 0, 31_536_000],
  ["JOB_LOCAL_CONCURRENCY", 1, 100],
  ["JOB_POLL_INTERVAL_SECONDS", 1, 300],
  ["JOB_SHUTDOWN_TIMEOUT_MS", 1_000, 300_000],
  ["JOB_RETENTION_DAYS", 1, 3_650],
  ["JOB_PAYMENT_HOLD_MINUTES", 1, 43_200],
  ["JOB_AUTHORIZED_STALE_MINUTES", 1, 43_200],
  ["JOB_CONFIRMING_STALE_MINUTES", 1, 43_200],
  ["JOB_CANCELLING_STALE_MINUTES", 1, 43_200],
  ["JOB_SWEEP_BATCH_SIZE", 1, 1_000],
  ["JOB_RECONCILE_LOOKBACK_HOURS", 1, 720],
  ["JOB_RECONCILE_BATCH_SIZE", 1, 1_000],
  ["JOB_MISSING_PROVIDER_GRACE_MINUTES", 1, 43_200],
  ["JOB_LEDGER_LOOKBACK_DAYS", 1, 3_650],
  ["JOB_LEDGER_BATCH_SIZE", 1, 10_000],
];

const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"];
const LOG_FORMATS = ["json", "pretty"];

export const validateEnv = (config: Record<string, unknown>) => {
  const missing = REQUIRED_ENV_VARS.filter((key) => !config[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n${missing.map((key) => `   - ${key}`).join("\n")}`,
    );
  }

  // Payments and bookings are not production-ready until milestone M2 (idempotent bookings with
  // server-side prices), so a production deployment must not be able to charge real cards.
  // This guard is removed when M2 completes.
  const stripeKey = String(config.STRIPE_API_KEY ?? "");
  if (config.NODE_ENV === "production" && /^(sk|rk)_live_/.test(stripeKey)) {
    throw new Error(
      "Refusing to start with NODE_ENV=production and a live Stripe key: payments and bookings " +
        "are not production-ready until milestone M2. Use a Stripe test key (sk_test_...).",
    );
  }

  const runWorker = config.RUN_WORKER;
  if (runWorker !== undefined && runWorker !== "true" && runWorker !== "false") {
    throw new Error(`Invalid RUN_WORKER "${String(runWorker)}". Use "true" or "false"`);
  }

  const apiDocs = config.ENABLE_API_DOCS;
  if (apiDocs !== undefined && apiDocs !== "true" && apiDocs !== "false") {
    throw new Error(`Invalid ENABLE_API_DOCS "${String(apiDocs)}". Use "true" or "false"`);
  }

  for (const [name, min, max] of INTEGER_SETTINGS) {
    const value = config[name];
    if (value === undefined || value === "") continue;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
      throw new Error(
        `Invalid ${name} "${String(value)}". Use a whole number from ${min} to ${max}`,
      );
    }
  }

  // BCRYPT_COST exists so tests can hash quickly. A production server must not be weakened by it.
  const bcryptCost = config.BCRYPT_COST;
  if (config.NODE_ENV === "production" && bcryptCost !== undefined && bcryptCost !== "") {
    if (Number(bcryptCost) < 12) {
      throw new Error(
        `BCRYPT_COST "${String(bcryptCost)}" is too low for production; use 12 or more`,
      );
    }
  }

  const level = config.LOG_LEVEL;
  if (level !== undefined && !LOG_LEVELS.includes(String(level))) {
    throw new Error(`Invalid LOG_LEVEL "${String(level)}". Allowed: ${LOG_LEVELS.join(", ")}`);
  }
  const format = config.LOG_FORMAT;
  if (format !== undefined && !LOG_FORMATS.includes(String(format))) {
    throw new Error(`Invalid LOG_FORMAT "${String(format)}". Allowed: ${LOG_FORMATS.join(", ")}`);
  }

  return config;
};
