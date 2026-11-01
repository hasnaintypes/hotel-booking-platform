const MESSAGES: Record<string, string> = {
  access_denied: "Google sign-in was cancelled.",
  oauth_state: "That sign-in attempt could not be verified. Please try again.",
  oauth_config: "Google sign-in is not configured.",
  token_exchange: "Could not complete Google sign-in.",
  email_unverified: "Your Google email address isn't verified, so it can't be used to sign in.",
  account_exists:
    "An account with this email already exists. Sign in with your email and password instead.",
  account_disabled: "This account has been deactivated.",
};

const FALLBACK = "Something went wrong. Please try again.";

/** What to tell the user for the `error` code the API sends back after Google sign-in. */
export function oauthErrorMessage(code: string | null | undefined): string {
  return (code && MESSAGES[code]) || FALLBACK;
}
