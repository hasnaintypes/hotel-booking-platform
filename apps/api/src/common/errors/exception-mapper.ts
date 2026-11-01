import { HttpException, HttpStatus } from "@nestjs/common";
import type { ErrorCode, FieldError } from "./problem";
import { InvalidJsonException } from "./invalid-json.exception";
import { RateLimitedException } from "./rate-limited.exception";
import { ValidationFailedException } from "./validation-failed.exception";

export type MappedError = {
  status: number;
  code: ErrorCode;
  title: string;
  /** Safe to return to the client. 5xx details are always generic. */
  detail: string;
  errors?: FieldError[];
  headers?: Record<string, string>;
};

const TITLES: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  402: "Payment Required",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  409: "Conflict",
  413: "Payload Too Large",
  415: "Unsupported Media Type",
  422: "Unprocessable Entity",
  429: "Too Many Requests",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
};

const CODE_BY_STATUS: Record<number, ErrorCode> = {
  400: "BAD_REQUEST",
  401: "UNAUTHENTICATED",
  402: "PAYMENT_DECLINED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  405: "METHOD_NOT_ALLOWED",
  409: "CONFLICT",
  413: "PAYLOAD_TOO_LARGE",
  415: "UNSUPPORTED_MEDIA_TYPE",
  422: "UNPROCESSABLE",
  429: "TOO_MANY_REQUESTS",
  500: "INTERNAL_ERROR",
  502: "UPSTREAM_ERROR",
  503: "SERVICE_UNAVAILABLE",
  504: "UPSTREAM_ERROR",
};

const GENERIC_5XX = "The server could not complete the request. Please try again later.";

const titleFor = (status: number) =>
  TITLES[status] ?? (status >= 500 ? "Server Error" : "Request Error");
const codeFor = (status: number): ErrorCode =>
  CODE_BY_STATUS[status] ?? (status >= 500 ? "INTERNAL_ERROR" : "BAD_REQUEST");

const make = (
  status: number,
  code: ErrorCode,
  detail: string,
  extra: Partial<MappedError> = {},
): MappedError => ({
  status,
  code,
  title: titleFor(status),
  // Never expose internal detail for server faults.
  detail: status >= 500 ? GENERIC_5XX : detail,
  ...extra,
});

type ErrorLike = {
  name?: string;
  code?: unknown;
  type?: unknown;
  status?: unknown;
  statusCode?: unknown;
  message?: unknown;
  errors?: Record<string, { path?: string; message?: string }>;
  kind?: string;
  path?: string;
};

const asError = (value: unknown): ErrorLike =>
  value && typeof value === "object" ? (value as ErrorLike) : {};

function messageOf(response: unknown, fallback: string): string {
  if (typeof response === "string") return response;
  if (response && typeof response === "object") {
    const message = (response as { message?: unknown }).message;
    if (typeof message === "string") return message;
    if (Array.isArray(message)) return message.map(String).join("; ");
  }
  return fallback;
}

/**
 * Maps any thrown value to a safe, deliberate HTTP error. Pure function: no I/O,
 * no logging; the filter decides how to log.
 */
export function mapException(exception: unknown): MappedError {
  // 1. Application / framework exceptions
  if (exception instanceof ValidationFailedException) {
    return make(400, "VALIDATION_FAILED", "Request validation failed", {
      errors: exception.fieldErrors,
    });
  }
  if (exception instanceof InvalidJsonException) {
    return make(400, "INVALID_JSON", exception.message);
  }
  if (exception instanceof RateLimitedException) {
    const seconds = Math.max(1, Math.ceil(exception.retryAfterSeconds));
    return make(429, "TOO_MANY_REQUESTS", exception.message, {
      headers: { "Retry-After": String(seconds) },
    });
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const detail = messageOf(exception.getResponse(), exception.message);
    // A CORS rejection raised by the CORS layer carries this marker message.
    if (status === 403 && detail === CORS_REJECTION_MESSAGE) {
      return make(403, "CORS_ORIGIN_NOT_ALLOWED", detail);
    }
    return make(status, codeFor(status), detail);
  }

  const err = asError(exception);

  // 2. Body parser (body-parser / http-errors)
  if (typeof err.type === "string") {
    const fromParser = mapBodyParserError(err.type);
    if (fromParser) return fromParser;
  }

  // 3. Upload limits
  if (err.name === "MulterError") {
    return err.code === "LIMIT_FILE_SIZE"
      ? make(413, "PAYLOAD_TOO_LARGE", "An uploaded file is too large.")
      : make(400, "BAD_REQUEST", "The file upload was rejected.");
  }

  // 4. Database errors (Mongo/Mongoose now; Postgres mapping replaces this in M1)
  if (err.code === 11000) {
    return make(409, "CONFLICT", "A resource with the same unique value already exists.");
  }
  if (err.name === "CastError") {
    return make(400, "INVALID_ID", "The supplied identifier is not valid.");
  }
  if (err.name === "ValidationError" && err.errors && typeof err.errors === "object") {
    const errors = Object.entries(err.errors).map(([field, e]) => ({
      field: e?.path ?? field,
      message: e?.message ?? "Invalid value",
    }));
    return make(422, "UNPROCESSABLE", "The data failed validation.", { errors });
  }

  // 5. Stripe
  if (typeof err.type === "string" && err.type.startsWith("Stripe")) {
    if (err.type === "StripeCardError") {
      return make(402, "PAYMENT_DECLINED", "The card was declined.");
    }
    if (err.type === "StripeRateLimitError") {
      return make(503, "SERVICE_UNAVAILABLE", GENERIC_5XX, { headers: { "Retry-After": "5" } });
    }
    return make(502, "UPSTREAM_ERROR", GENERIC_5XX);
  }

  // 6. Any other http-errors style error with a client status
  const status = Number(err.status ?? err.statusCode);
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    return make(status, codeFor(status), "The request could not be processed.");
  }

  // 7. Unexpected
  return make(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", GENERIC_5XX);
}

function mapBodyParserError(type: string): MappedError | undefined {
  switch (type) {
    case "entity.parse.failed":
      return make(400, "INVALID_JSON", "The request body is not valid JSON.");
    case "entity.too.large":
      return make(413, "PAYLOAD_TOO_LARGE", "The request body is too large.");
    case "encoding.unsupported":
    case "charset.unsupported":
      return make(415, "UNSUPPORTED_MEDIA_TYPE", "Unsupported request encoding.");
    case "request.aborted":
    case "request.size.invalid":
      return make(400, "BAD_REQUEST", "The request could not be read.");
    default:
      return undefined;
  }
}

export const CORS_REJECTION_MESSAGE = "Origin not allowed by CORS policy";
