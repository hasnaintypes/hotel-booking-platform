import { z } from "zod";

/** An unguessable primary identifier. */
export const uuidSchema = z.uuid();

/** Dates cross the wire as ISO 8601 strings; the API never sends Date objects. */
export const isoDateTimeSchema = z.iso.datetime();

/** The page-based pagination the v1 catalogue endpoints use until #61 moves them to cursors. */
export const paginationSchema = z.object({
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pages: z.number().int().nonnegative(),
});

export type Pagination = z.infer<typeof paginationSchema>;
