import { isAxiosError } from "axios";

const DEFAULT_MESSAGE = "Something went wrong. Please try again.";
const OFFLINE_MESSAGE = "We couldn't reach the server. Check your connection and try again.";

type ProblemBody = {
  errors?: Array<{ message?: unknown }>;
  detail?: unknown;
  message?: unknown;
};

const isText = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "";

/**
 * The most helpful text for a failed API call: the server's field messages (for example the
 * password rule), otherwise its summary, otherwise a neutral fallback. Axios' own message
 * ("Request failed with status code 400") is never shown to a person.
 */
export function apiErrorMessage(error: unknown, fallback = DEFAULT_MESSAGE): string {
  if (!isAxiosError(error)) return fallback;
  if (!error.response) return OFFLINE_MESSAGE;

  const body = error.response.data as ProblemBody | undefined;

  const fieldMessages = Array.isArray(body?.errors)
    ? body.errors.map((entry) => entry?.message).filter(isText)
    : [];
  if (fieldMessages.length > 0) return fieldMessages.join(" ");

  if (isText(body?.detail)) return body.detail;
  if (isText(body?.message)) return body.message;
  return fallback;
}
