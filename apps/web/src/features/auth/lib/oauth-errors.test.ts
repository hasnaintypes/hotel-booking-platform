import { describe, expect, it } from "vitest";
import { oauthErrorMessage } from "./oauth-errors";

describe("oauthErrorMessage", () => {
  it.each([
    ["access_denied", /cancelled/],
    ["oauth_state", /could not be verified/],
    ["oauth_config", /not configured/],
    ["token_exchange", /Could not complete/],
    ["email_unverified", /isn't verified/],
    ["account_exists", /already exists/],
    ["account_disabled", /deactivated/],
  ])("explains %s", (code, expected) => {
    expect(oauthErrorMessage(code)).toMatch(expected);
  });

  it.each(["server_error", "oauth_error", "unknown_thing", "", null, undefined])(
    "uses a neutral message for %s",
    (code) => {
      expect(oauthErrorMessage(code)).toBe("Something went wrong. Please try again.");
    },
  );

  it("never repeats text taken from the URL", () => {
    expect(oauthErrorMessage("<script>alert(1)</script>")).not.toContain("script");
  });
});
