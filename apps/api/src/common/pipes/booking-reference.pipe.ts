import { ArgumentMetadata, Injectable, PipeTransform } from "@nestjs/common";
import { ValidationFailedException } from "../errors/validation-failed.exception";
import { isUuid } from "../utils/uuid";

/** A public reference is at least 16 lowercase base-36 characters (see the DB check). */
const PUBLIC_REFERENCE = /^[a-z0-9]{16,64}$/;

/**
 * Accepts either the booking UUID or its high-entropy public reference on the same parameter, so
 * guests can poll with the reference they were given while internal callers keep using ids.
 */
@Injectable()
export class BookingReferencePipe implements PipeTransform<unknown, string> {
  transform(value: unknown, metadata?: ArgumentMetadata): string {
    if (typeof value === "string" && (isUuid(value) || PUBLIC_REFERENCE.test(value))) {
      return value;
    }
    throw new ValidationFailedException([
      { field: metadata?.data || "id", message: "must be a booking id or public reference" },
    ]);
  }
}
