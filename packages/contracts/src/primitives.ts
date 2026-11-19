import { z } from "zod";

/** An unguessable primary identifier. */
export const uuidSchema = z.uuid();

/** Dates cross the wire as ISO 8601 strings; the API never sends Date objects. */
export const isoDateTimeSchema = z.iso.datetime();

/**
 * Request-side timestamps also accept an explicit offset, which the previous ISO 8601 rule
 * allowed. Stored and returned timestamps are always UTC.
 */
export const isoDateTimeInputSchema = z.iso.datetime({ offset: true });
