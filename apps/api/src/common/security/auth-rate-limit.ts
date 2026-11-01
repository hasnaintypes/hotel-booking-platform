/** Window for the per-IP limit on sign-in and registration. */
export const AUTH_RATE_LIMIT_TTL_MS = 15 * 60 * 1000;

/**
 * Per-IP limit for the sign-in and registration routes, for use with @Throttle. The count is read
 * on each request from AUTH_RATE_LIMIT (default 10 per window) so tests can change it.
 */
export const authRateLimit = {
  default: {
    limit: () => {
      const configured = Number(process.env.AUTH_RATE_LIMIT);
      return Number.isInteger(configured) && configured >= 1 ? configured : 10;
    },
    ttl: AUTH_RATE_LIMIT_TTL_MS,
  },
};
