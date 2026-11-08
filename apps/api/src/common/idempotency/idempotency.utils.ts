import { createHash } from "node:crypto";

export const IDEMPOTENCY_KEY_HEADER = "idempotency-key";

export type IdempotencyRequestFingerprint = {
  method: string;
  baseUrl?: string;
  route?: string;
  path?: string;
  params?: unknown;
  query?: unknown;
  body?: unknown;
};

const normalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(normalize);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .reduce<Record<string, unknown>>((sorted, key) => {
        sorted[key] = normalize(record[key]);
        return sorted;
      }, {});
  }
  return value;
};

/** Stable JSON: object keys are sorted recursively, so equivalent bodies hash identically. */
export const canonicalJson = (value: unknown): string => JSON.stringify(normalize(value));

export const hashIdempotentRequest = (request: IdempotencyRequestFingerprint): string =>
  createHash("sha256").update(canonicalJson(request)).digest("hex");

/**
 * A scope is per operation and per principal. Without the principal, one user could replay another
 * user's response by guessing a key.
 */
export const idempotencyScope = (operation: string, userId?: string): string =>
  `${operation}:${userId ?? "anonymous"}`;

export const isValidIdempotencyKey = (key: string): boolean => {
  if (key.length < 1 || key.length > 255) return false;
  for (const character of key) {
    const code = character.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) return false;
  }
  return true;
};
