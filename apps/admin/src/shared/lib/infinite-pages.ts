import type { InfiniteData } from "@tanstack/react-query";
import type { CursorPage } from "@hotel-booking/contracts";

/** Flattens the cursor pages an infinite query accumulated into the rows a table renders. */
export const flattenPages = <T>(data: InfiniteData<CursorPage<T>> | undefined): T[] =>
  data?.pages.flatMap((page) => page.data) ?? [];

/**
 * `getNextPageParam` for every admin list. The API's last page carries `nextCursor: null`, which
 * React Query wants as `undefined` so `hasNextPage` turns false instead of fetching `cursor=null`.
 */
export const nextCursorPageParam = <T>(lastPage: CursorPage<T>): string | undefined =>
  lastPage.pageInfo.nextCursor ?? undefined;

/**
 * Applies an optimistic change to one item and keeps the page envelope intact. Used by the role and
 * active-status mutations, whose cache entries are now cursor pages rather than flat arrays.
 */
export const mapInfiniteRows = <T>(
  data: InfiniteData<CursorPage<T>> | undefined,
  mapRow: (row: T) => T,
): InfiniteData<CursorPage<T>> | undefined =>
  data
    ? {
        ...data,
        pages: data.pages.map((page) => ({ ...page, data: page.data.map(mapRow) })),
      }
    : data;
