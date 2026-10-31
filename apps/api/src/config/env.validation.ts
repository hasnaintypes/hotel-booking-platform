const REQUIRED_ENV_VARS = [
  "MONGODB_CONNECTION_STRING",
  "JWT_SECRET_KEY",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "STRIPE_API_KEY",
] as const;

const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"];
const LOG_FORMATS = ["json", "pretty"];

export const validateEnv = (config: Record<string, unknown>) => {
  const missing = REQUIRED_ENV_VARS.filter((key) => !config[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n${missing.map((key) => `   - ${key}`).join("\n")}`,
    );
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
