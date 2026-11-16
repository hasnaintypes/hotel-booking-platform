import { createHash } from "node:crypto";

/**
 * Strong entity tag over the exact representation a client received.
 *
 * The value is stable for identical bodies and changes whenever any field does, so it doubles as
 * the optimistic-concurrency token for `If-Match`. Hashing the representation (rather than reading a
 * database version column) means every resource can opt in without a schema change; the trade-off
 * is that semantically irrelevant changes such as a recomputed average rating also invalidate it,
 * which is the safe direction for a precondition.
 */
export const representationEtag = (value: unknown): string => {
  const body = JSON.stringify(value) ?? "";
  return `"${createHash("sha256").update(body).digest("base64url").slice(0, 27)}"`;
};

/** Strips the weakness marker so `W/"x"` and `"x"` compare equal, as RFC 9110 allows. */
const normalize = (tag: string): string => tag.trim().replace(/^W\//, "");

const tags = (header: string): string[] =>
  header
    .split(",")
    .map(normalize)
    .filter((tag) => tag.length > 0);

/** `If-None-Match`: true when the client already holds this representation. */
export const ifNoneMatchSatisfied = (header: string | undefined, etag: string): boolean => {
  if (!header) return false;
  const values = tags(header);
  return values.includes("*") || values.includes(normalize(etag));
};

/** `If-Match`: false when the client's copy is stale; a missing header is not a failure. */
export const ifMatchSatisfied = (header: string | undefined, etag: string): boolean => {
  if (header === undefined) return true;
  const values = tags(header);
  return values.includes("*") || values.includes(normalize(etag));
};
