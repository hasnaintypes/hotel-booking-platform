import axiosInstance from "@hotel-booking/api-client";

/**
 * AI draft assist — returns text only; caller must Apply (never auto-save).
 * 503 when AI_ASSIST_ENABLED is not true on the server.
 */
export const suggestAiAssist = async (payload: {
  kind: "hotel_description" | "insights_copy";
  input: string;
  context?: Record<string, unknown>;
}): Promise<{
  draft: string;
  provider: "groq" | "openai" | "openrouter" | "stub";
  model?: string;
  usedFallback?: boolean;
  warning?: string;
}> => {
  const response = await axiosInstance.post("/api/ai/suggest", payload);
  return response.data;
};
