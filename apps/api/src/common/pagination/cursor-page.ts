import type { CursorPage, CursorPageQuery } from "@hotel-booking/contracts";
import { pageLimit } from "@hotel-booking/contracts";
import { encodeScopedCursor } from "./sorted-cursor";

/**
 * A row as a list query returns it: the record plus the exact text of its sort key.
 *
 * The key comes from the database (`to_char(... 'US')` for timestamps) rather than from a `Date`,
 * because a `Date` only carries milliseconds while the column keeps microseconds. Truncating the
 * anchor would skip rows that share the returned row's millisecond.
 */
export type CursorRow<T> = T & { cursorKey: string };

/** The position of a row in the list's ordering. */
export const anchorOf = <T extends { id: string; cursorKey: string }>(
  row: T,
): { key: string; id: string } => ({ key: row.cursorKey, id: row.id });

/**
 * Turns a repository page into the ADR-024 collection shape.
 *
 * Repositories fetch `limit + 1` rows: the extra row is how the server knows whether another page
 * exists without a `count(*)` over the whole filter. The cursor points at the last row a client
 * actually received, so the next request is a strict "after this key" range.
 */
export const pageOf = <T>(
  rows: T[],
  limit: number,
  scope: string,
  position: (row: T) => { key: string; id: string },
): CursorPage<T> => {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const last = data.at(-1);
  const anchor = hasMore && last ? position(last) : undefined;

  return {
    data,
    pageInfo: {
      hasMore,
      nextCursor: anchor ? encodeScopedCursor(scope, anchor.key, anchor.id) : null,
    },
  };
};

/**
 * The `limit + 1` fetch size for a list query, and whether the caller asked for a page at all.
 *
 * `limit` is defaulted and capped by the contract, so a request cannot drive an unbounded read.
 */
export const pageSize = (query: CursorPageQuery): number => pageLimit(query);
