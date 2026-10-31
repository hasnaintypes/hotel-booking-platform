export type ErrorCode =
  | "BAD_REQUEST"
  | "INVALID_JSON"
  | "INVALID_ID"
  | "VALIDATION_FAILED"
  | "UNAUTHENTICATED"
  | "PAYMENT_DECLINED"
  | "FORBIDDEN"
  | "CORS_ORIGIN_NOT_ALLOWED"
  | "NOT_FOUND"
  | "METHOD_NOT_ALLOWED"
  | "CONFLICT"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "UNPROCESSABLE"
  | "TOO_MANY_REQUESTS"
  | "UPSTREAM_ERROR"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

export type FieldError = { field: string; message: string };

/** RFC 9457 problem details plus stable machine fields. `message` is a compatibility alias of `detail`. */
export type ProblemDetails = {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: ErrorCode;
  requestId?: string;
  errors?: FieldError[];
  message: string;
};

export const PROBLEM_CONTENT_TYPE = "application/problem+json";

export function problemType(code: ErrorCode): string {
  return `urn:hotel-booking:problem:${code.toLowerCase().replace(/_/g, "-")}`;
}
