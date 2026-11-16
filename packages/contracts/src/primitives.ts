import { z } from "zod";

/** An unguessable primary identifier. */
export const uuidSchema = z.uuid();

/** Dates cross the wire as ISO 8601 strings; the API never sends Date objects. */
export const isoDateTimeSchema = z.iso.datetime();
