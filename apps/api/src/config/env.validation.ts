const REQUIRED_ENV_VARS = [
  "MONGODB_CONNECTION_STRING",
  "JWT_SECRET_KEY",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "STRIPE_API_KEY",
] as const;

/** Optional whole-number settings and the range each may take: [name, min, max]. */
const INTEGER_SETTINGS: Array<[string, number, number]> = [
  ["BOOKING_MAX_NIGHTS", 1, 365],
  ["BCRYPT_COST", 4, 15],
  ["AUTH_RATE_LIMIT", 1, 10_000],
  ["AUTH_MAX_FAILED_LOGINS", 1, 100],
  ["AI_DAILY_QUOTA", 1, 10_000],
  ["AI_PER_MINUTE_LIMIT", 1, 600],
  ["AI_REQUEST_DEADLINE_MS", 1_000, 120_000],
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
