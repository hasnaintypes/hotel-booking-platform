import { z } from "zod";

/**
 * Every machine-readable error code the API may return. The list is exhaustive on purpose: a
 * client switches on `code`, so adding a code is a contract change (ADR-024).
 */
export const ERROR_CODES = [
  "BAD_REQUEST",
  "INVALID_JSON",
  "INVALID_ID",
  "VALIDATION_FAILED",
  "UNAUTHENTICATED",
  "PAYMENT_DECLINED",
  "FORBIDDEN",
  "CORS_ORIGIN_NOT_ALLOWED",
  "NOT_FOUND",
  "METHOD_NOT_ALLOWED",
  "CONFLICT",
  "PRECONDITION_FAILED",
  "PAYLOAD_TOO_LARGE",
  "UNSUPPORTED_MEDIA_TYPE",
  "UNPROCESSABLE",
  "TOO_MANY_REQUESTS",
  "UPSTREAM_ERROR",
  "SERVICE_UNAVAILABLE",
  "INTERNAL_ERROR",
] as const;

export const errorCodeSchema = z.enum(ERROR_CODES);

export const fieldErrorSchema = z.object({
  field: z.string(),
  message: z.string(),
});

/** RFC 9457 problem details plus the stable machine fields the clients depend on. */
export const problemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
  instance: z.string(),
  code: errorCodeSchema,
  requestId: z.string().optional(),
  errors: z.array(fieldErrorSchema).optional(),
  /** Compatibility alias of `detail`. */
  message: z.string(),
});

export const PROBLEM_CONTENT_TYPE = "application/problem+json";

export const problemType = (code: ErrorCode): string =>
  `urn:hotel-booking:problem:${code.toLowerCase().replace(/_/g, "-")}`;

export type ErrorCode = z.infer<typeof errorCodeSchema>;
export type FieldError = z.infer<typeof fieldErrorSchema>;
export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
