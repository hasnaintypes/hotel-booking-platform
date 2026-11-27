import { randomUUID } from "node:crypto";
import { requestIdSchema } from "@hotel-booking/contracts";

export const REQUEST_ID_HEADER = "x-request-id";

// Accept ids produced by gateways and clients, but only in a safe, bounded form:
// log injection (newlines, control characters) and unbounded values are rejected.
// The contract owns the pattern so HTTP, logs and job payloads agree on it.
export function resolveRequestId(incoming: string | string[] | undefined): string {
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  if (candidate && requestIdSchema.safeParse(candidate).success) return candidate;
  return randomUUID();
}
