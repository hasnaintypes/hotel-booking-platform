import axios, { InternalAxiosRequestConfig } from "axios";
import { authSession } from "./auth-session";

// API origin: copy .env.local.example → .env.local. Canonical local backend port is 5001 (see backend PORT).
const viteEnv = (
  import.meta as ImportMeta & { env?: { VITE_API_BASE_URL?: string; DEV?: boolean } }
).env;

const getBaseURL = () => {
  if (viteEnv?.VITE_API_BASE_URL) {
    return viteEnv.VITE_API_BASE_URL;
  }

  // Must match hotel-booking-backend PORT (default 5001) when VITE_API_BASE_URL is unset.
  return "http://localhost:5001";
};

export const getApiBaseUrl = getBaseURL;

/** Limits for automatic retries. Only safe or idempotency-keyed requests are ever retried. */
export const RETRY_LIMITS = {
  /** Extra attempts after a 429 response. */
  rateLimit: 3,
  /** Extra attempts after a network error (no response). */
  network: 2,
  /** Base delay for exponential back-off after a 429 without Retry-After. */
  baseDelayMs: 1000,
  /** Delay before retrying after a network error. */
  networkDelayMs: 2000,
  /** The longest wait we accept from a Retry-After header. */
  maxRetryAfterMs: 10_000,
  /** Stop retrying once this much time has passed since the first attempt. */
  budgetMs: 20_000,
} as const;

/** Counters that make automatic retries observable (tests, debugging). */
export const retryStats = { rateLimited: 0, network: 0 };

interface RetryState {
  rateLimitRetries: number;
  networkRetries: number;
  startedAt: number;
}

// Extend axios config to include retry bookkeeping
interface CustomAxiosRequestConfig extends InternalAxiosRequestConfig {
  metadata?: RetryState;
}

// Create axios instance with consistent configuration
const axiosInstance = axios.create({
  baseURL: getBaseURL(),
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true, // Ensure cookies are sent with requests
  timeout: 30000, // 30 second timeout
});

// Session auth travels in the httpOnly cookie; no bearer token is attached here.
axiosInstance.interceptors.request.use((config: CustomAxiosRequestConfig) => {
  // Set once per logical request. A retry re-enters this interceptor and must keep its counters.
  config.metadata ??= { rateLimitRetries: 0, networkRetries: 0, startedAt: Date.now() };
  return config;
});

const SAFE_METHODS = new Set(["get", "head", "options"]);

/** Retry only requests that cannot cause a second side effect. */
const isRetryable = (config: CustomAxiosRequestConfig): boolean => {
  const method = (config.method ?? "get").toLowerCase();
  if (SAFE_METHODS.has(method)) return true;
  const headers = config.headers as { get?: (name: string) => unknown } | undefined;
  return Boolean(headers?.get?.("Idempotency-Key"));
};

/** Parse Retry-After (seconds or an HTTP date) into milliseconds, or undefined if unusable. */
const parseRetryAfter = (value: unknown): number | undefined => {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
};

/** Spread retries out by +/-25% so clients do not retry in lockstep. */
const withJitter = (ms: number) => Math.round(ms * (0.75 + Math.random() * 0.5));

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const debugRetry = (
  kind: string,
  attempt: number,
  delayMs: number,
  config: InternalAxiosRequestConfig,
) => {
  if (viteEnv?.DEV) {
    console.debug(
      `[api-client] retry ${kind} #${attempt} in ${delayMs}ms: ${config.method?.toUpperCase()} ${config.url}`,
    );
  }
};

// Response interceptor to handle common errors and retries
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config as CustomAxiosRequestConfig | undefined;

    // Handle 401 errors by clearing the local session hint; components handle redirects.
    if (error.response?.status === 401) {
      authSession.clear();
    }

    const state = config?.metadata;
    if (!config || !state || axios.isCancel(error) || !isRetryable(config)) {
      return Promise.reject(error);
    }

    let kind: "rateLimited" | "network" | undefined;
    let delayMs = 0;

    if (error.response?.status === 429 && state.rateLimitRetries < RETRY_LIMITS.rateLimit) {
      kind = "rateLimited";
      const retryAfter = parseRetryAfter(error.response.headers?.["retry-after"]);
      delayMs =
        retryAfter !== undefined
          ? Math.min(retryAfter, RETRY_LIMITS.maxRetryAfterMs)
          : withJitter(RETRY_LIMITS.baseDelayMs * 2 ** state.rateLimitRetries);
    } else if (!error.response && state.networkRetries < RETRY_LIMITS.network) {
      kind = "network";
      delayMs = withJitter(RETRY_LIMITS.networkDelayMs);
    }

    // Give up once the overall retry budget would be exceeded.
    if (!kind || Date.now() - state.startedAt + delayMs > RETRY_LIMITS.budgetMs) {
      return Promise.reject(error);
    }

    if (kind === "rateLimited") {
      state.rateLimitRetries += 1;
      retryStats.rateLimited += 1;
      debugRetry(kind, state.rateLimitRetries, delayMs, config);
    } else {
      state.networkRetries += 1;
      retryStats.network += 1;
      debugRetry(kind, state.networkRetries, delayMs, config);
    }

    await sleep(delayMs);
    return axiosInstance(config);
  },
);

export default axiosInstance;
