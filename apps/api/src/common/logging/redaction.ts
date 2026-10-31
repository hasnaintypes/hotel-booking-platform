/**
 * Fields that must never reach the logs. Request headers and bodies are not logged by
 * default; these paths are defence in depth for any object that is logged later.
 */
export const REDACT_PATHS: string[] = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers['x-api-key']",
  "req.headers['stripe-signature']",
  "res.headers['set-cookie']",
  "*.password",
  "*.passwordHash",
  "*.token",
  "*.accessToken",
  "*.refreshToken",
  "*.secret",
  "*.clientSecret",
  "*.client_secret",
  "*.apiKey",
  "*.cardNumber",
  "*.cvc",
];

export const REDACT_CENSOR = "[Redacted]";

/** Credentials embedded in URLs, e.g. mongodb://user:password@host or https://token@host. */
const URL_CREDENTIALS = /(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi;

/** Removes URL credentials from free text such as error messages and stack traces. */
export function scrubSecrets(text: string): string {
  return text.replace(URL_CREDENTIALS, `$1${REDACT_CENSOR}@`);
}

/** Request path without the query string (query values can carry tokens and PII). */
export function pathOnly(url: string | undefined): string {
  if (!url) return "";
  const index = url.indexOf("?");
  return index === -1 ? url : url.slice(0, index);
}
