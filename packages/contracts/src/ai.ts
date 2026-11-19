import { z } from "zod";
import { trimmedAs } from "./body";

/** The drafts the assistant can write. */
export const SUGGEST_KINDS = ["hotel_description", "insights_copy"] as const;

/** Longest text accepted as the basis for a draft; it is sent to a paid provider. */
export const MAX_SUGGEST_INPUT_CHARS = 2000;

/** `POST /api/v1/manage/ai/suggestions`. */
export const suggestRequestSchema = z.object({
  kind: z.enum(SUGGEST_KINDS),
  input: trimmedAs(
    z.string().min(1, { error: "input must not be empty" }).max(MAX_SUGGEST_INPUT_CHARS),
  ),
});

export type SuggestRequest = z.infer<typeof suggestRequestSchema>;
