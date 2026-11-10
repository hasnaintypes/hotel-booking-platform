const stripTrailingSlash = (value?: string) => (value ? value.replace(/\/$/, "") : value);

export const configuration = () => {
  const port = parseInt(process.env.PORT || "5001", 10);

  const nodeEnv = process.env.NODE_ENV || "development";

  return {
    nodeEnv,
    logging: {
      level:
        process.env.LOG_LEVEL ??
        (nodeEnv === "production" ? "info" : nodeEnv === "test" ? "silent" : "debug"),
      format: (process.env.LOG_FORMAT ?? (nodeEnv === "development" ? "pretty" : "json")) as
        "json" | "pretty",
      service: "hotel-booking-api",
      environment: nodeEnv,
    },
    port,
    apiDocs: {
      // On outside production; in production only when ENABLE_API_DOCS=true (and then admin-only).
      enabled:
        process.env.ENABLE_API_DOCS !== undefined
          ? process.env.ENABLE_API_DOCS === "true"
          : nodeEnv !== "production",
    },
    frontendUrl: stripTrailingSlash(process.env.FRONTEND_URL) || "http://localhost:5174",
    adminUrl: stripTrailingSlash(process.env.ADMIN_URL) || "http://localhost:5175",
    backendUrl: stripTrailingSlash(process.env.BACKEND_URL) || `http://localhost:${port}`,
    database: {
      url: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/hotel_booking",
      maxConnections: parseInt(process.env.DATABASE_POOL_MAX || "10", 10),
      statementTimeoutMs: parseInt(process.env.DATABASE_STATEMENT_TIMEOUT_MS || "5000", 10),
      idleInTransactionTimeoutMs: parseInt(
        process.env.DATABASE_IDLE_IN_TRANSACTION_TIMEOUT_MS || "10000",
        10,
      ),
      lockTimeoutMs: parseInt(process.env.DATABASE_LOCK_TIMEOUT_MS || "3000", 10),
    },
    jwt: {
      secret: process.env.JWT_SECRET_KEY,
      expiresIn: "1d",
    },
    google: {
      clientId: process.env.GOOGLE_ID,
      clientSecret: process.env.GOOGLE_SECRET,
    },
    cloudinary: {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
      apiSecret: process.env.CLOUDINARY_API_SECRET,
      // Keeps each environment's uploads apart so test images never mix with production ones.
      folder: process.env.CLOUDINARY_FOLDER || `hotel-booking/${nodeEnv}`,
      tags: ["hotel-booking", nodeEnv],
    },
    stripe: {
      apiKey: process.env.STRIPE_API_KEY,
    },
    auth: {
      // Failed sign-ins per account before it is locked for 15 minutes.
      maxFailedLogins: parseInt(process.env.AUTH_MAX_FAILED_LOGINS || "5", 10),
    },
    booking: {
      maxNights: parseInt(process.env.BOOKING_MAX_NIGHTS || "30", 10),
    },
    payment: {
      // Lease held while a capture/refund/creation provider call is in flight.
      claimTimeoutMs: parseInt(process.env.PAYMENT_CLAIM_TIMEOUT_MS || "30000", 10),
    },
    idempotency: {
      // How long a stored response can be replayed before the key expires.
      ttlHours: parseInt(process.env.IDEMPOTENCY_TTL_HOURS || "48", 10),
      // Lease held by an in-flight request; a crash releases it after this long.
      lockTimeoutMs: parseInt(process.env.IDEMPOTENCY_LOCK_TIMEOUT_MS || "30000", 10),
    },
    jobs: {
      workerEnabled: process.env.RUN_WORKER === "true",
      schema: process.env.PGBOSS_SCHEMA || "pgboss",
      outboxPollIntervalMs: parseInt(process.env.JOB_OUTBOX_POLL_MS || "1000", 10),
      outboxBatchSize: parseInt(process.env.JOB_OUTBOX_BATCH_SIZE || "25", 10),
      outboxMaxAttempts: parseInt(process.env.JOB_OUTBOX_MAX_ATTEMPTS || "10", 10),
      outboxRetryDelayMs: parseInt(process.env.JOB_OUTBOX_RETRY_DELAY_MS || "5000", 10),
      outboxRetryDelayMaxMs: parseInt(process.env.JOB_OUTBOX_RETRY_DELAY_MAX_MS || "300000", 10),
      outboxLockTimeoutMs: parseInt(process.env.JOB_OUTBOX_LOCK_TIMEOUT_MS || "60000", 10),
      retryLimit: parseInt(process.env.JOB_RETRY_LIMIT || "3", 10),
      retryDelaySeconds: parseInt(process.env.JOB_RETRY_DELAY_SECONDS || "5", 10),
      retryDelayMaxSeconds: parseInt(process.env.JOB_RETRY_DELAY_MAX_SECONDS || "300", 10),
      expireInSeconds: parseInt(process.env.JOB_EXPIRE_SECONDS || "900", 10),
      deleteAfterSeconds: parseInt(process.env.JOB_DELETE_AFTER_SECONDS || "604800", 10),
      localConcurrency: parseInt(process.env.JOB_LOCAL_CONCURRENCY || "5", 10),
      pollingIntervalSeconds: parseInt(process.env.JOB_POLL_INTERVAL_SECONDS || "2", 10),
      deadLetterSuffix: process.env.JOB_DEAD_LETTER_SUFFIX || ".dead-letter",
      shutdownTimeoutMs: parseInt(process.env.JOB_SHUTDOWN_TIMEOUT_MS || "30000", 10),
      retentionDays: parseInt(process.env.JOB_RETENTION_DAYS || "30", 10),
      paymentHoldMinutes: parseInt(process.env.JOB_PAYMENT_HOLD_MINUTES || "30", 10),
      reconcileStaleMinutes: parseInt(process.env.JOB_RECONCILE_STALE_MINUTES || "60", 10),
      schedules: {
        expiry: process.env.JOB_EXPIRY_CRON || "*/5 * * * *",
        reconcile: process.env.JOB_RECONCILE_CRON || "*/15 * * * *",
        cleanup: process.env.JOB_CLEANUP_CRON || "0 * * * *",
      },
    },
    ai: {
      enabled: process.env.AI_ASSIST_ENABLED === "true",
      groqApiKey: process.env.GROQ_API_KEY,
      groqModel: process.env.GROQ_MODEL,
      openaiApiKey: process.env.OPENAI_API_KEY,
      openaiModel: process.env.OPENAI_MODEL,
      openrouterApiKey: process.env.OPENROUTER_API_KEY,
      openrouterModel: process.env.OPENROUTER_MODEL,
      // Per user. Counters are in memory, so they reset when the server restarts.
      dailyQuota: parseInt(process.env.AI_DAILY_QUOTA || "20", 10),
      perMinuteLimit: parseInt(process.env.AI_PER_MINUTE_LIMIT || "5", 10),
      // One deadline for the whole request, however many providers are tried.
      deadlineMs: parseInt(process.env.AI_REQUEST_DEADLINE_MS || "30000", 10),
    },
  };
};

export type AppConfig = ReturnType<typeof configuration>;
