const STORAGE_PREFIX = "hotel-booking:idempotency:";

const memory = new Map<string, string>();

const sessionStore = (): Storage | undefined => {
  try {
    return typeof sessionStorage === "undefined" ? undefined : sessionStorage;
  } catch {
    return undefined;
  }
};

const randomKey = (): string => {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
};

/**
 * Returns one stable key per checkout/cancellation session. Keeping it in sessionStorage means a
 * page reload during checkout still retries with the same key instead of creating a second booking.
 */
export const idempotencyKeyFor = (session: string): string => {
  const storageKey = `${STORAGE_PREFIX}${session}`;
  const existing = memory.get(storageKey) ?? sessionStore()?.getItem(storageKey);
  if (existing) {
    memory.set(storageKey, existing);
    return existing;
  }

  const key = randomKey();
  memory.set(storageKey, key);
  sessionStore()?.setItem(storageKey, key);
  return key;
};

export const clearIdempotencyKey = (session: string): void => {
  const storageKey = `${STORAGE_PREFIX}${session}`;
  memory.delete(storageKey);
  sessionStore()?.removeItem(storageKey);
};

export const idempotencyHeaders = (session: string): Record<string, string> => ({
  "Idempotency-Key": idempotencyKeyFor(session),
});
