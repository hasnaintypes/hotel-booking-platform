import { ValidationFailedException } from "../errors/validation-failed.exception";

/**
 * Cursor pagination codec.
 *
 * A cursor is the position of the last row a page returned, encoded so clients treat it as opaque.
 * It carries the row's sort key and id, which together are unique for every ordering we expose, so
 * the next page is a plain "strictly after this key" range query with no offset and no skipped or
 * repeated rows when data changes between pages.
 *
 * The version prefix lets a future change to the encoding fail cleanly instead of silently
 * returning the wrong page.
 */
const CURSOR_VERSION = 1;

export type Cursor = {
  /** The last row's value for the endpoint's sort key, as text. */
  key: string;
  /** The last row's id, which breaks ties on equal sort keys. */
  id: string;
};

export const encodeCursor = ({ key, id }: Cursor): string =>
  Buffer.from(JSON.stringify([CURSOR_VERSION, key, id]), "utf8").toString("base64url");

/**
 * Decodes a client-supplied cursor. Anything that was not produced by `encodeCursor` is a malformed
 * request parameter, not a server error, so it surfaces as the same field-level validation failure
 * the other query parameters produce.
 */
export const decodeCursor = (raw: string): Cursor => {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (
      Array.isArray(parsed) &&
      parsed.length === 3 &&
      parsed[0] === CURSOR_VERSION &&
      typeof parsed[1] === "string" &&
      typeof parsed[2] === "string"
    ) {
      return { key: parsed[1], id: parsed[2] };
    }
  } catch {
    // Fall through to the validation failure below.
  }

  throw new ValidationFailedException([{ field: "cursor", message: "Invalid cursor" }]);
};
