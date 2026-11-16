import type { ErrorCode } from "@hotel-booking/contracts";

/**
 * The problem codes ADR-024 allows for each status. Anything else is a mapping bug, not a client
 * error, so the route matrix fails rather than documenting the mismatch.
 */
export const CODES_BY_STATUS: Partial<Record<number, readonly ErrorCode[]>> = {
  400: ["BAD_REQUEST", "INVALID_JSON", "VALIDATION_FAILED"],
  401: ["UNAUTHENTICATED"],
  402: ["PAYMENT_DECLINED"],
  403: ["FORBIDDEN", "CORS_ORIGIN_NOT_ALLOWED"],
  404: ["NOT_FOUND"],
  405: ["METHOD_NOT_ALLOWED"],
  409: ["CONFLICT"],
  412: ["PRECONDITION_FAILED"],
  413: ["PAYLOAD_TOO_LARGE"],
  415: ["UNSUPPORTED_MEDIA_TYPE"],
  422: ["UNPROCESSABLE"],
  429: ["TOO_MANY_REQUESTS"],
  500: ["INTERNAL_ERROR"],
  502: ["UPSTREAM_ERROR"],
  503: ["SERVICE_UNAVAILABLE"],
  504: ["UPSTREAM_ERROR"],
};

/** Every status ADR-024 permits, including the success and redirect responses. */
export const ADR_STATUSES = new Set([
  200, 201, 202, 204, 301, 302, 304, 400, 401, 402, 403, 404, 405, 409, 412, 413, 415, 422, 429,
  500, 502, 503, 504,
]);

export const expectedCodes = (status: number): readonly ErrorCode[] =>
  CODES_BY_STATUS[status] ?? [];

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
