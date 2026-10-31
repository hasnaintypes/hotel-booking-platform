import { randomUUID } from "node:crypto";

export const REQUEST_ID_HEADER = "x-request-id";

// Accept ids produced by gateways and clients, but only in a safe, bounded form:
// log injection (newlines, control characters) and unbounded values are rejected.
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;

export function resolveRequestId(incoming: string | string[] | undefined): string {
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  if (candidate && SAFE_REQUEST_ID.test(candidate)) return candidate;
  return randomUUID();
}
