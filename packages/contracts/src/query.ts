import { z } from "zod";

/**
 * Query-string coercion for request schemas.
 *
 * Everything arrives as text (or as an array of text), and clients omit unset filters by sending
 * an empty value rather than dropping the key. These helpers encode that one convention instead of
 * repeating it per field:
 *
 * - `""`, `null` and `undefined` mean "not provided";
 * - repeated keys (`?types=A&types=B`) and a single key (`?types=A`) mean the same thing;
 * - non-scalar values are ignored, so `?destination[$ne]=x` cannot reach a repository;
 * - numbers are parsed only after the empty-value rule applies, so `?page=` is absent rather than 0.
 */
const absent = (value: unknown): unknown => (value === "" || value === null ? undefined : value);

const scalar = (value: unknown): string | number | undefined =>
  typeof value === "string" || typeof value === "number" ? value : undefined;

const toNumber = (value: unknown): unknown => {
  const single = scalar(absent(value));
  if (single === undefined) return undefined;
  return typeof single === "number" ? single : single.trim() === "" ? undefined : Number(single);
};

const toList = (value: unknown): unknown[] | undefined => {
  const present = absent(value);
  if (present === undefined) return undefined;
  return Array.isArray(present) ? present : [present];
};

export const optionalQueryString = (maxLength: number) =>
  z.preprocess((value) => scalar(absent(value)), z.string().max(maxLength).optional());

export const optionalQueryInt = (min: number, max: number) =>
  z.preprocess(toNumber, z.number().int().min(min).max(max).optional());

export const optionalQueryIntList = (maxItems: number, min: number, max: number) =>
  z.preprocess(
    (value) => toList(value)?.map((item) => (typeof item === "string" ? Number(item) : item)),
    z.array(z.number().int().min(min).max(max)).max(maxItems).optional(),
  );

export const optionalQueryStringList = (maxItems: number, maxLength: number) =>
  z.preprocess(
    (value) => toList(value)?.filter((item) => typeof item === "string"),
    z.array(z.string().max(maxLength)).max(maxItems).optional(),
  );

/** A closed set of query values, e.g. a sort option. Empty means "not provided". */
export const optionalQueryEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess((value) => scalar(absent(value)), z.enum(values).optional());
