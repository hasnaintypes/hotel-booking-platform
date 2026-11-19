import { z } from "zod";

/**
 * JSON-body coercion for request schemas.
 *
 * Bodies arrive as JSON, but browsers and older clients still send numbers as text, clear an
 * optional field by sending `""` or `null`, and sometimes send a single value where a list is
 * expected. These helpers encode those conventions once instead of repeating them per field:
 *
 * - text is trimmed before its constraints run;
 * - `""`, `null` and `undefined` mean "not provided" for optional fields;
 * - a single value where a list is expected means a one-item list.
 */
export const trimmed = (value: unknown): unknown =>
  typeof value === "string" ? value.trim() : value;

/** Trims a text body field before applying a schema such as an email or URL check. */
export const trimmedAs = <T extends z.ZodType>(schema: T) => z.preprocess(trimmed, schema);

/** A required trimmed string with an inclusive length range. */
export const trimmedText = (maxLength: number, minLength = 0) =>
  trimmedAs(z.string().min(minLength).max(maxLength));

/** Like `trimmedText`, but "not sent" stays undefined. */
export const optionalTrimmedText = (maxLength: number, minLength = 0) =>
  z.preprocess(trimmed, z.string().min(minLength).max(maxLength).optional());

/**
 * A URL that a browser can load: http or https, with a protocol and a real host name. It mirrors
 * the `require_protocol` URL rule the API applied before, which also rejects `javascript:` and
 * other script-bearing schemes.
 */
export const httpUrl = z.url({ protocol: /^https?$/, hostname: z.regexes.domain });

/**
 * An optional text field that may also be sent empty. `""` is accepted as "cleared", and the
 * constraints apply only once something was actually entered.
 */
export const entered = <T extends z.ZodType>(schema: T) =>
  z.preprocess(trimmed, z.union([z.literal(""), schema]).optional());

/** A numeric body field that also accepts a numeric string, treating `""` as not provided. */ export const toNumber =
  (value: unknown): unknown => {
    if (value === undefined || value === null || value === "") return undefined;
    return typeof value === "string" ? Number(value) : value;
  };

/** A body field that may be a single value or a list; empty means "nothing selected". */ export const toList =
  (value: unknown): unknown[] => {
    if (value === undefined || value === null || value === "") return [];
    return Array.isArray(value) ? value : [value];
  };

/** Like `toList`, but "not sent" stays undefined so it can be told apart from an empty list. */
export const toOptionalList = (value: unknown): unknown => {
  if (value === undefined || value === null || value === "") return undefined;
  return Array.isArray(value) ? value : [value];
};

/**
 * A body whose fields are all optional. HTTP clients legitimately send no body at all when there
 * is nothing to change (a guest cancelling without a reason, for example), so a missing body is
 * read as `{}` rather than as a validation failure. Anything that is present must still be an
 * object, so an array or a string body is rejected.
 */
export const optionalBody = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === undefined || value === null ? {} : value), schema);
