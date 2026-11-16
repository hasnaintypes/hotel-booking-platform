import type { FieldError } from "./problem";

type ZodIssueLike = {
  path?: PropertyKey[];
  message?: string;
};

/**
 * Turns Zod issues into the per-field errors ADR-024 already returns for class-validator DTOs.
 *
 * Array indices are dropped from the path so `stars: ["abc"]` reports `stars`, exactly like
 * class-validator's `each: true` constraints do. Object paths keep their shape (`contact.email`).
 */
export function fieldErrorsFromZod(error: unknown): FieldError[] {
  const issues = (error as { issues?: unknown } | null)?.issues;
  if (!Array.isArray(issues)) return [];

  return (issues as ZodIssueLike[]).map((issue) => {
    const field = (issue.path ?? [])
      .filter((segment): segment is string => typeof segment === "string")
      .join(".");
    return {
      field: field || "request",
      message: issue.message || "Invalid value",
    };
  });
}
