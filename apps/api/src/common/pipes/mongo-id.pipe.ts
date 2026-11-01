import { ArgumentMetadata, Injectable, PipeTransform } from "@nestjs/common";
import { ValidationFailedException } from "../errors/validation-failed.exception";

// Exactly 24 hex characters. `ObjectId.isValid` also accepts any 12-character string, which is
// far too permissive for a path parameter.
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

/** Rejects a malformed id with a field-level 400 instead of letting Mongoose raise a cast error. */
@Injectable()
export class MongoIdPipe implements PipeTransform<unknown, string> {
  transform(value: unknown, metadata?: ArgumentMetadata): string {
    if (typeof value !== "string" || !OBJECT_ID.test(value)) {
      throw new ValidationFailedException([
        { field: metadata?.data || "id", message: "must be a valid id" },
      ]);
    }
    return value;
  }
}
