import axios, { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authSession } from "./auth-session";
import axiosInstance, { RETRY_LIMITS, retryStats } from "./http";

type Respond = (config: InternalAxiosRequestConfig, call: number) => Promise<unknown>;

const ok = (config: InternalAxiosRequestConfig) =>
  Promise.resolve({ data: {}, status: 200, statusText: "OK", headers: {}, config });

const status = (code: number, headers: Record<string, string> = {}): Respond => {
  return (config) =>
    Promise.reject(
      new AxiosError(`status ${code}`, "ERR_BAD_REQUEST", config, null, {
        data: {},
        status: code,
        statusText: "",
        headers,
        config,
      }),
    );
};

const networkError: Respond = (config) =>
  Promise.reject(new AxiosError("Network Error", "ERR_NETWORK", config));

let adapter: ReturnType<typeof vi.fn>;

const useAdapter = (respond: Respond) => {
  adapter = vi.fn((config: InternalAxiosRequestConfig) =>
    respond(config, adapter.mock.calls.length),
  );
  axiosInstance.defaults.adapter = adapter as unknown as AxiosAdapter;
};

/** Start a request and let every pending retry timer run. Resolves to the value or the error. */
const settle = async (request: Promise<unknown>) => {
  const outcome = request.then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  await vi.runAllTimersAsync();
  return outcome;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0.5); // no jitter: factor 1.0
  retryStats.rateLimited = 0;
  retryStats.network = 0;
});

afterEach(() => {
  vi.useRealTimers();
  authSession.clear();
  localStorage.clear();
});

describe("api-client retries", () => {
  it("stops a GET after 1 + 3 calls when every response is 429", async () => {
    useAdapter(status(429));
    const result = await settle(axiosInstance.get("/hotels"));

    expect(adapter).toHaveBeenCalledTimes(1 + RETRY_LIMITS.rateLimit);
    expect((result as { error: AxiosError }).error.response?.status).toBe(429);
    expect(retryStats.rateLimited).toBe(RETRY_LIMITS.rateLimit);
  });

  it("stops a GET after 1 + 2 calls on repeated network errors", async () => {
    useAdapter(networkError);
    const result = await settle(axiosInstance.get("/hotels"));

    expect(adapter).toHaveBeenCalledTimes(1 + RETRY_LIMITS.network);
    expect((result as { error: AxiosError }).error.code).toBe("ERR_NETWORK");
    expect(retryStats.network).toBe(RETRY_LIMITS.network);
  });

  it("recovers when a retry succeeds", async () => {
    useAdapter((config, call) => (call < 3 ? status(429)(config, call) : ok(config)));
    const result = await settle(axiosInstance.get("/hotels"));

    expect(adapter).toHaveBeenCalledTimes(3);
    expect(result).toHaveProperty("value");
  });

  it.each([
    ["429", status(429)],
    ["a network error", networkError],
  ])("never retries a POST after %s", async (_name, respond) => {
    useAdapter(respond);
    await settle(axiosInstance.post("/hotels/1/bookings", { totalCost: 100 }));

    expect(adapter).toHaveBeenCalledTimes(1);
    expect(retryStats).toEqual({ rateLimited: 0, network: 0 });
  });

  it("does not retry PATCH or DELETE", async () => {
    useAdapter(status(429));
    await settle(axiosInstance.patch("/bookings/1/status", {}));
    await settle(axiosInstance.delete("/bookings/1"));

    expect(adapter).toHaveBeenCalledTimes(2);
  });

  it("retries a POST that carries an Idempotency-Key", async () => {
    useAdapter(status(429));
    await settle(axiosInstance.post("/bookings", {}, { headers: { "Idempotency-Key": "abc" } }));

    expect(adapter).toHaveBeenCalledTimes(1 + RETRY_LIMITS.rateLimit);
  });

  it("does not retry a cancelled request", async () => {
    useAdapter((config) => Promise.reject(new axios.CanceledError("cancelled", config)));
    await settle(axiosInstance.get("/hotels"));

    expect(adapter).toHaveBeenCalledTimes(1);
  });

  it("does not retry other error statuses", async () => {
    useAdapter(status(500));
    await settle(axiosInstance.get("/hotels"));

    expect(adapter).toHaveBeenCalledTimes(1);
  });
});

describe("Retry-After and the retry budget", () => {
  it("waits for the Retry-After delay before retrying", async () => {
    useAdapter((config, call) =>
      call === 1 ? status(429, { "retry-after": "3" })(config, call) : ok(config),
    );
    const request = axiosInstance.get("/hotels");

    await vi.advanceTimersByTimeAsync(2999);
    expect(adapter).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(adapter).toHaveBeenCalledTimes(2);
    await expect(request).resolves.toBeDefined();
  });

  it("caps an excessive Retry-After", async () => {
    useAdapter((config, call) =>
      call === 1 ? status(429, { "retry-after": "3600" })(config, call) : ok(config),
    );
    const request = axiosInstance.get("/hotels");

    await vi.advanceTimersByTimeAsync(RETRY_LIMITS.maxRetryAfterMs - 1);
    expect(adapter).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(adapter).toHaveBeenCalledTimes(2);
    await expect(request).resolves.toBeDefined();
  });

  it("stops retrying once the overall budget would be exceeded", async () => {
    useAdapter(status(429, { "retry-after": "10" }));
    await settle(axiosInstance.get("/hotels"));

    // Retries at 10 s and 20 s fit the 20 s budget; a third would end at 30 s.
    expect(adapter).toHaveBeenCalledTimes(3);
  });
});

describe("401 handling", () => {
  it("clears the session hint and does not retry", async () => {
    authSession.set();
    expect(authSession.get()).toBe(true);

    useAdapter(status(401));
    const result = await settle(axiosInstance.get("/api/users/me"));

    expect((result as { error: AxiosError }).error.response?.status).toBe(401);
    expect(authSession.get()).toBe(false);
    expect(adapter).toHaveBeenCalledTimes(1);
  });
});
