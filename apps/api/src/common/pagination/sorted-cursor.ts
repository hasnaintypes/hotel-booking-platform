import { ValidationFailedException } from "../errors/validation-failed.exception";
import { type Cursor, decodeCursor, encodeCursor } from "./cursor";

/**
 * A cursor is only meaningful for the ordering it was minted for. This file binds the opaque codec
 * to that ordering: the cursor carries a scope (the endpoint's sort) in front of its key, so a
 * cursor from a different sort, or a hand-made key of the wrong type, is rejected instead of
 * silently returning a wrong page.
 *
 * The scope is carried inside the key because the codec stays a plain `(key, id)` pair.
 */
const SEPARATOR = "|";

const invalid = () =>
  new ValidationFailedException([{ field: "cursor", message: "Invalid cursor" }]);

const readScopedCursor = (raw: string | undefined, scope: string): Cursor | undefined => {
  if (raw === undefined) return undefined;

  const cursor = decodeCursor(raw);
  const separator = cursor.key.indexOf(SEPARATOR);
  if (separator === -1 || cursor.id.length === 0) throw invalid();

  const cursorScope = cursor.key.slice(0, separator);
  const key = cursor.key.slice(separator + 1);
  if (cursorScope !== scope || key.length === 0) throw invalid();

  return { key, id: cursor.id };
};

/** For lists ordered by a `timestamptz` column. */
export const readTimestampCursor = (
  raw: string | undefined,
  scope: string,
): (Cursor & { at: Date }) | undefined => {
  const cursor = readScopedCursor(raw, scope);
  if (!cursor) return undefined;

  const at = new Date(cursor.key);
  if (Number.isNaN(at.getTime())) throw invalid();
  return { ...cursor, at };
};

/** For lists ordered by an integer column. */
export const readNumberCursor = (
  raw: string | undefined,
  scope: string,
): (Cursor & { value: number }) | undefined => {
  const cursor = readScopedCursor(raw, scope);
  if (!cursor) return undefined;

  const value = Number(cursor.key);
  if (!Number.isSafeInteger(value)) throw invalid();
  return { ...cursor, value };
};

/** For lists ordered by a text or enum column. */
export const readTextCursor = (raw: string | undefined, scope: string): Cursor | undefined =>
  readScopedCursor(raw, scope);

/** A cursor returned to a client must carry the same scope it was read under. */
export const encodeScopedCursor = (scope: string, key: string, id: string): string =>
  encodeCursor({ key: `${scope}${SEPARATOR}${key}`, id });
