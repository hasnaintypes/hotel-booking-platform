import { type SQL, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { Cursor } from "./cursor";

/**
 * SQL building blocks for keyset pagination.
 *
 * The cursor is compared with the row value `(sort column, id)`, which is exactly the index order a
 * list reads, so the database seeks into the next page instead of scanning and discarding offsets.
 * Cursors are bound as parameters and cast to the column's type; the cast string is always a
 * literal supplied by the repository, never request data.
 */

/**
 * The exact stored text of a `timestamptz` sort key, microseconds included.
 *
 * A `Date` in JavaScript stops at milliseconds while the column keeps microseconds, so an anchor
 * built from `row.updatedAt.toISOString()` would skip the rows that share its millisecond.
 */
export const timestampCursorKey = (column: PgColumn): SQL<string> =>
  sql<string>`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

/** Rows strictly after the cursor under a descending `(column, id)` ordering. */
export const afterDesc = (
  column: PgColumn,
  idColumn: PgColumn,
  cursor: Cursor,
  cast: "timestamptz" | "date" | "integer" | "smallint" | "text",
): SQL => sql`(${column}, ${idColumn}) < (${cursor.key}::${sql.raw(cast)}, ${cursor.id}::uuid)`;

/** Rows strictly after the cursor under an ascending `(column, id)` ordering. */
export const afterAsc = (
  column: PgColumn,
  idColumn: PgColumn,
  cursor: Cursor,
  cast: "timestamptz" | "date" | "integer" | "smallint" | "text",
): SQL => sql`(${column}, ${idColumn}) > (${cursor.key}::${sql.raw(cast)}, ${cursor.id}::uuid)`;

/**
 * Rows strictly after the cursor under `column ASC, id DESC`, the ordering used when a list is
 * ascending on its sort column and still wants newest-first ties.
 */
export const afterAscWithDescTiebreak = (
  column: PgColumn,
  idColumn: PgColumn,
  cursor: Cursor,
  cast: "timestamptz" | "date" | "integer" | "smallint" | "text",
): SQL =>
  sql`(${column} > ${cursor.key}::${sql.raw(cast)} or (${column} = ${cursor.key}::${sql.raw(cast)} and ${idColumn} < ${cursor.id}::uuid))`;
