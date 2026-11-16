import { z } from "zod";
import { optionalQueryInt, optionalQueryString } from "./query";

/** Applied when a list request omits `limit`. */
export const DEFAULT_PAGE_LIMIT = 20;
/** The largest `limit` a list request may ask for; anything above is a validation error. */
export const MAX_PAGE_LIMIT = 100;

/**
 * Cursor pagination query for every list endpoint.
 *
 * Cursors are opaque to clients: they encode the last row's sort key and id, so the next page
 * starts exactly after it even while rows are inserted or deleted. `limit` is absent rather than 0
 * when a client sends `?limit=`, and the server applies `DEFAULT_PAGE_LIMIT`.
 */
export const cursorPageQuerySchema = z.object({
  limit: optionalQueryInt(1, MAX_PAGE_LIMIT),
  cursor: optionalQueryString(512),
});

/** Paging metadata that accompanies a page of items. */
export const pageInfoSchema = z.object({
  /** Opaque cursor for the next page, or null when this is the last page. */
  nextCursor: z.string().nullable(),
  /** True when at least one more row exists after this page. */
  hasMore: z.boolean(),
});

/** A page of items in the shape ADR-024 documents for collections. */
export const cursorPageSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    data: z.array(item),
    pageInfo: pageInfoSchema,
  });

export type CursorPageQuery = z.infer<typeof cursorPageQuerySchema>;
export type PageInfo = z.infer<typeof pageInfoSchema>;
export type CursorPage<T> = { data: T[]; pageInfo: PageInfo };

/** The effective page size for a parsed query. */
export const pageLimit = (query: CursorPageQuery): number => query.limit ?? DEFAULT_PAGE_LIMIT;
