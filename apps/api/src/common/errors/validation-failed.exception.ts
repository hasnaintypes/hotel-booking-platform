import { BadRequestException } from "@nestjs/common";
import type { ValidationError } from "class-validator";
import type { FieldError } from "./problem";

/** Thrown by the global ValidationPipe with machine-readable, per-field errors. */
export class ValidationFailedException extends BadRequestException {
  constructor(public readonly fieldErrors: FieldError[]) {
    super("Request validation failed");
  }
}

export function flattenValidationErrors(errors: ValidationError[], parent = ""): FieldError[] {
  const out: FieldError[] = [];
  for (const error of errors) {
    const field = parent ? `${parent}.${error.property}` : error.property;
    if (error.constraints) {
      for (const message of Object.values(error.constraints)) out.push({ field, message });
    }
    if (error.children?.length) out.push(...flattenValidationErrors(error.children, field));
  }
  return out;
}
