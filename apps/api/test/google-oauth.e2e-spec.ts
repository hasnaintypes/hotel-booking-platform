import { JwtService } from "@nestjs/jwt";
import { createHash } from "node:crypto";
import { Types } from "mongoose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestApp, type TestApp } from "./support/create-app";
import { anonymous, withEnv } from "./support/helpers";
import { routes } from "./support/routes";

const FRONTEND = "http://localhost:5174";
const COOKIE = "oauth_state";

type Profile = Record<string, unknown>;

describe("Google sign-in", () => {
  let t: TestApp | undefined;
  let restoreEnv: (() => void) | undefined;
  let googleCalls: Array<{ url: string; body?: URLSearchParams }>;
  let profile: Profile;
  let tokenResponse: Record<string, unknown>;
  let userinfoOk: boolean;

  const defaultProfile = (): Profile => ({
    email: "grace@example.test",
    verified_email: true,
    name: "Grace Hopper",
    picture: "https://img.test/grace.png",
  });

  const boot = async () => {
    googleCalls = [];
    profile = defaultProfile();
    tokenResponse = { access_token: "google-access-token" };
    userinfoOk = true;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: { body?: URLSearchParams }) => {
        googleCalls.push({ url: String(url), body: init?.body });
        if (String(url).includes("oauth2.googleapis.com/token")) {
          return { ok: true, status: 200, json: async () => tokenResponse };
        }
        return { ok: userinfoOk, status: userinfoOk ? 200 : 500, json: async () => profile };
      }),
    );

    restoreEnv = withEnv({
      GOOGLE_ID: "test-client.apps.googleusercontent.com",
      GOOGLE_SECRET: "test-secret",
    });
    t = await createTestApp();
    return t;
  };

  afterEach(async () => {
    vi.unstubAllGlobals();
    await t?.close();
    restoreEnv?.();
    t = undefined;
    restoreEnv = undefined;
  });

  const users = (app: TestApp) => app.connection.collection("users");

  /** Starts a sign-in the way a browser does and returns what it would carry to the callback. */
  const start = async (app: TestApp) => {
    const res = await anonymous(app).get(routes.auth.google).redirects(0);
    const location = new URL(res.headers.location);
    const setCookie = (res.headers["set-cookie"] as unknown as string[]) ?? [];
    const raw = setCookie.find((c) => c.startsWith(`${COOKIE}=`));
    return {
      res,
      location,
      state: location.searchParams.get("state") ?? "",
      challenge: location.searchParams.get("code_challenge") ?? "",
      cookie: raw?.split(";")[0].slice(COOKIE.length + 1) ?? "",
      rawCookie: raw ?? "",
    };
  };

  const callback = (app: TestApp, query: Record<string, string>, cookie?: string) => {
    const req = anonymous(app).get(routes.auth.googleCallback).query(query).redirects(0);
    return cookie === undefined ? req : req.set("Cookie", `${COOKIE}=${cookie}`);
  };

  const sessionCookie = (res: { headers: Record<string, unknown> }) =>
    ((res.headers["set-cookie"] as string[] | undefined) ?? []).find((c) =>
      c.startsWith("session_id="),
    );

  const reason = (res: { headers: Record<string, unknown> }) =>
    new URL(String(res.headers.location)).searchParams.get("error");

  describe("starting", () => {
    it("redirects to Google with state and a PKCE challenge, and sets a state cookie", async () => {
      const app = await boot();
      const { res, location, state, challenge, rawCookie } = await start(app);

      expect(res.status).toBe(302);
      expect(location.origin + location.pathname).toBe(
        "https://accounts.google.com/o/oauth2/v2/auth",
      );
      expect(location.searchParams.get("client_id")).toBe("test-client.apps.googleusercontent.com");
      expect(location.searchParams.get("redirect_uri")).toBe(
        "http://localhost:5001/api/auth/callback/google",
      );
      expect(state).toMatch(/^[0-9a-f]{64}$/);
      expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(location.searchParams.get("code_challenge_method")).toBe("S256");

      expect(rawCookie).toMatch(/HttpOnly/i);
      expect(rawCookie).toMatch(/SameSite=Lax/i);
      expect(rawCookie).toMatch(/Path=\/api\/auth/);
      expect(rawCookie).toMatch(/Max-Age=600/);
      expect(sessionCookie(res)).toBeUndefined();
    });

    it("uses a fresh state and challenge each time", async () => {
      const app = await boot();
      const first = await start(app);
      const second = await start(app);
      expect(second.state).not.toBe(first.state);
      expect(second.challenge).not.toBe(first.challenge);
    });
  });

  describe("completing", () => {
    it("signs a new user in and redirects without any personal data", async () => {
      const app = await boot();
      const { state, cookie } = await start(app);

      const res = await callback(app, { code: "auth-code", state }, cookie);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(`${FRONTEND}/auth/callback?authenticated=1`);
      for (const secret of ["grace", "Grace", "Hopper", "example.test", "img.test"]) {
        expect(res.headers.location).not.toContain(secret);
      }
      expect(sessionCookie(res)).toMatch(/HttpOnly/i);

      const user = await users(app).findOne({ email: "grace@example.test" });
      expect(user).toMatchObject({
        firstName: "Grace",
        lastName: "Hopper",
        emailVerified: true,
        image: "https://img.test/grace.png",
      });
    });

    it("sends Google the PKCE verifier that matches the challenge", async () => {
      const app = await boot();
      const { state, challenge, cookie } = await start(app);

      await callback(app, { code: "auth-code", state }, cookie);

      const exchange = googleCalls.find((c) => c.url.includes("oauth2.googleapis.com/token"));
      const verifier = exchange?.body?.get("code_verifier") ?? "";
      expect(verifier).not.toBe("");
      expect(createHash("sha256").update(verifier).digest("base64url")).toBe(challenge);
      expect(exchange?.body?.get("code")).toBe("auth-code");
    });

    it("clears the state cookie whatever the outcome", async () => {
      const app = await boot();
      const { state, cookie } = await start(app);

      const ok = await callback(app, { code: "auth-code", state }, cookie);
      const cleared = (ok.headers["set-cookie"] as unknown as string[]).find((c) =>
        c.startsWith(`${COOKIE}=;`),
      );
      expect(cleared).toBeDefined();

      const refused = await callback(app, { code: "auth-code", state: "wrong" }, cookie);
      expect(
        (refused.headers["set-cookie"] as unknown as string[]).some((c) =>
          c.startsWith(`${COOKIE}=;`),
        ),
      ).toBe(true);
    });

    it("signs in again an account that was created through Google", async () => {
      const app = await boot();
      const first = await start(app);
      await callback(app, { code: "c", state: first.state }, first.cookie);
      const before = await users(app).countDocuments();

      profile = { ...defaultProfile(), picture: "https://img.test/new.png" };
      const second = await start(app);
      const res = await callback(app, { code: "c", state: second.state }, second.cookie);

      expect(res.headers.location).toBe(`${FRONTEND}/auth/callback?authenticated=1`);
      expect(sessionCookie(res)).toBeDefined();
      expect(await users(app).countDocuments()).toBe(before);
      expect((await users(app).findOne({ email: "grace@example.test" }))?.image).toBe(
        "https://img.test/new.png",
      );
    });
  });

  describe("a callback this browser did not start", () => {
    const expectRefused = async (
      app: TestApp,
      res: { status: number; headers: Record<string, unknown> },
    ) => {
      expect(res.status).toBe(302);
      expect(reason(res)).toBe("oauth_state");
      expect(String(res.headers.location)).toMatch(/\/sign-in\?error=oauth_state$/);
      expect(sessionCookie(res)).toBeUndefined();
      expect(googleCalls).toHaveLength(0);
      expect(await users(app).countDocuments()).toBe(0);
    };

    it("is refused when the state cookie is missing", async () => {
      const app = await boot();
      const { state } = await start(app);
      await expectRefused(app, await callback(app, { code: "c", state }));
    });

    it("is refused when the state in the URL is wrong or missing", async () => {
      const app = await boot();
      const { cookie } = await start(app);
      await expectRefused(app, await callback(app, { code: "c", state: "f".repeat(64) }, cookie));
      await expectRefused(app, await callback(app, { code: "c" }, cookie));
    });

    it("is refused when the state belongs to a different sign-in", async () => {
      const app = await boot();
      const first = await start(app);
      const second = await start(app);
      await expectRefused(
        app,
        await callback(app, { code: "c", state: second.state }, first.cookie),
      );
    });

    it("is refused when the cookie was tampered with or signed with another secret", async () => {
      const app = await boot();
      const { state, cookie } = await start(app);
      await expectRefused(app, await callback(app, { code: "c", state }, `${cookie}x`));

      const forged = new JwtService({ secret: "another-secret" }).sign(
        { state, verifier: "v" },
        { audience: "oauth-state", expiresIn: "10m" },
      );
      await expectRefused(app, await callback(app, { code: "c", state }, forged));
    });

    it("is refused when the cookie has expired", async () => {
      const app = await boot();
      const { state } = await start(app);
      const expired = app.app
        .get(JwtService)
        .sign({ state, verifier: "v" }, { audience: "oauth-state", expiresIn: -10 });
      await expectRefused(app, await callback(app, { code: "c", state }, expired));
    });

    it("is refused when a session token is offered in place of the state token", async () => {
      const app = await boot();
      const { state } = await start(app);
      const session = app.app.get(JwtService).sign({ userId: new Types.ObjectId().toString() });
      await expectRefused(app, await callback(app, { code: "c", state }, session));
    });

    it("cannot use the state token as a session", async () => {
      const app = await boot();
      const { cookie } = await start(app);

      const res = await anonymous(app)
        .get(routes.users.me)
        .set("Authorization", `Bearer ${cookie}`);

      expect(res.status).toBe(401);
    });
  });

  describe("what Google reports", () => {
    it("does not pass Google's error text on", async () => {
      const app = await boot();
      const { state, cookie } = await start(app);

      const res = await callback(app, { error: "<script>alert(1)</script>", state }, cookie);

      expect(reason(res)).toBe("oauth_error");
      expect(String(res.headers.location)).not.toContain("script");
    });

    it("reports a user who declined", async () => {
      const app = await boot();
      const res = await callback(app, { error: "access_denied" });
      expect(reason(res)).toBe("access_denied");
    });

    it("refuses an email Google has not verified", async () => {
      const app = await boot();
      const { state, cookie } = await start(app);
      profile = { ...defaultProfile(), verified_email: false };

      const res = await callback(app, { code: "c", state }, cookie);

      expect(reason(res)).toBe("email_unverified");
      expect(sessionCookie(res)).toBeUndefined();
      expect(await users(app).countDocuments()).toBe(0);
    });

    it.each([
      ["a missing verified flag", { verified_email: undefined }],
      ["a verified flag that is not true", { verified_email: "true" }],
      ["no email", { email: undefined }],
      ["an email that is not text", { email: { $ne: null } }],
    ])("refuses %s", async (_name, patch) => {
      const app = await boot();
      const { state, cookie } = await start(app);
      profile = { ...defaultProfile(), ...patch };

      const res = await callback(app, { code: "c", state }, cookie);

      expect(reason(res)).toBe("email_unverified");
      expect(await users(app).countDocuments()).toBe(0);
    });

    it("reports a failed code exchange", async () => {
      const app = await boot();
      const { state, cookie } = await start(app);
      tokenResponse = { error: "invalid_grant" };

      const res = await callback(app, { code: "c", state }, cookie);

      expect(reason(res)).toBe("token_exchange");
      expect(googleCalls.some((c) => c.url.includes("userinfo"))).toBe(false);
    });

    it("reports Google being unavailable without leaking details", async () => {
      const app = await boot();
      const { state, cookie } = await start(app);
      userinfoOk = false;

      const res = await callback(app, { code: "c", state }, cookie);

      expect(reason(res)).toBe("server_error");
      expect(sessionCookie(res)).toBeUndefined();
    });

    it("needs a code", async () => {
      const app = await boot();
      const { state, cookie } = await start(app);
      expect(reason(await callback(app, { state }, cookie))).toBe("oauth_config");
    });
  });

  describe("existing accounts", () => {
    const insertPasswordAccount = async (app: TestApp, overrides: Record<string, unknown> = {}) => {
      await users(app).insertOne({
        email: "grace@example.test",
        firstName: "Grace",
        lastName: "Local",
        password: "$2a$04$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234",
        role: "user",
        isActive: true,
        emailVerified: false,
        ...overrides,
      });
    };

    it("does not link Google to an account created with a password", async () => {
      const app = await boot();
      await insertPasswordAccount(app);
      const before = await users(app).findOne({ email: "grace@example.test" });
      const { state, cookie } = await start(app);

      const res = await callback(app, { code: "c", state }, cookie);

      expect(reason(res)).toBe("account_exists");
      expect(sessionCookie(res)).toBeUndefined();
      const after = await users(app).findOne({ email: "grace@example.test" });
      expect(after?.password).toBe(before?.password);
      expect(after?.emailVerified).toBe(false);
      expect(after?.image).toBeUndefined();
    });

    it("refuses a deactivated account", async () => {
      const app = await boot();
      await insertPasswordAccount(app, { emailVerified: true, isActive: false });
      const { state, cookie } = await start(app);

      const res = await callback(app, { code: "c", state }, cookie);

      expect(reason(res)).toBe("account_disabled");
      expect(sessionCookie(res)).toBeUndefined();
    });
  });
});
