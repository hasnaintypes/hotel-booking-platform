export const SESSION_COOKIE_NAME = "session_id";

export const authCookieOptions = (maxAgeMs = 86400000) => {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: (isProd ? "none" : "lax") as "none" | "lax",
    maxAge: maxAgeMs,
    path: "/",
  };
};

export const clearAuthCookieOptions = () => {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: (isProd ? "none" : "lax") as "none" | "lax",
    expires: new Date(0),
    path: "/",
  };
};

/** Holds the Google sign-in `state` and PKCE verifier between leaving for Google and coming back. */
export const OAUTH_STATE_COOKIE_NAME = "oauth_state";

// Lax (not None): Google sends the browser back with a top-level GET, which Lax allows. The cookie
// is only ever read by the callback route, so it is limited to that path.
export const oauthStateCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 10 * 60 * 1000,
  path: "/api/auth",
});

export const clearOauthStateCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api/auth",
});
