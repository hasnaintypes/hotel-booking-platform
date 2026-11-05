import { ArgumentMetadata, Injectable, PipeTransform } from "@nestjs/common";
import { ValidationFailedException } from "../errors/validation-failed.exception";
import { isUuid } from "../utils/uuid";

/** Rejects a malformed UUID with a field-level 400 instead of letting PostgreSQL raise a cast error. */
@Injectable()
export class UuidPipe implements PipeTransform<unknown, string> {
  transform(value: unknown, metadata?: ArgumentMetadata): string {
    if (!isUuid(value)) {
      throw new ValidationFailedException([
        { field: metadata?.data || "id", message: "must be a valid id" },
      ]);
    }
    return value;
  }
}
