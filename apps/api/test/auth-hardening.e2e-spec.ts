import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcryptjs";
import { Types } from "mongoose";
import { afterEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./support/create-app";
import { anonymous, insertHotel, newCredentials, registerUser, withEnv } from "./support/helpers";
import { routes } from "./support/routes";

const PASSWORD = "correct-horse-battery-staple";

describe("auth hardening", () => {
  let t: TestApp | undefined;
  let restoreEnv: (() => void) | undefined;

  afterEach(async () => {
    await t?.close();
    restoreEnv?.();
    t = undefined;
    restoreEnv = undefined;
  });

  const boot = async (env: Record<string, string> = {}) => {
    restoreEnv = withEnv(env);
    t = await createTestApp();
    return t;
  };

  const users = (app: TestApp) => app.connection.collection("users");

  /** Inserts an account directly, so the hash cost and the account state are under the test's control. */
  const insertUser = async (
    app: TestApp,
    options: { password?: string; cost?: number; isActive?: boolean } = {},
  ) => {
    const { email, firstName, lastName } = newCredentials();
    const password = options.password ?? PASSWORD;
    const result = await users(app).insertOne({
      email,
      firstName,
      lastName,
      password: bcrypt.hashSync(password, options.cost ?? 4),
      role: "user",
      isActive: options.isActive ?? true,
      emailVerified: false,
      totalBookings: 0,
      totalSpent: 0,
    });
    return { id: String(result.insertedId), email, password };
  };

  const login = (app: TestApp, email: string, password: string) =>
    anonymous(app).post(routes.auth.login).send({ email, password });

  const storedHash = async (app: TestApp, id: string) =>
    String((await users(app).findOne({ _id: new Types.ObjectId(id) }))!.password);

  describe("deactivated accounts", () => {
    it("refuses sign-in once the password is right, but gives nothing away before", async () => {
      const app = await boot();
      const account = await insertUser(app, { isActive: false });

      const right = await login(app, account.email, account.password);
      expect(right.status).toBe(403);
      expect(right.body.message).toMatch(/deactivated/i);
      expect(right.headers["set-cookie"]).toBeUndefined();

      const wrong = await login(app, account.email, "not-the-password");
      expect(wrong.status).toBe(400);
      expect(wrong.body.message).toBe("Invalid Credentials");
    });

    it("ends an existing session when the account is deactivated, and restores it on reactivation", async () => {
      const app = await boot();
      const { agent, user } = await registerUser(app);
      expect((await agent.get(routes.users.me)).status).toBe(200);

      const filter = { _id: new Types.ObjectId(user._id) };
      await users(app).updateOne(filter, { $set: { isActive: false } });
      expect((await agent.get(routes.users.me)).status).toBe(401);

      await users(app).updateOne(filter, { $set: { isActive: true } });
      expect((await agent.get(routes.users.me)).status).toBe(200);
    });

    it("treats a deactivated owner as anonymous on public routes", async () => {
      const app = await boot();
      const owner = await registerUser(app);
      const hidden = await insertHotel(app, owner.user._id, { isActive: false });

      expect((await owner.agent.get(routes.hotels.byId(hidden.id))).status).toBe(200);

      await users(app).updateOne(
        { _id: new Types.ObjectId(owner.user._id) },
        { $set: { isActive: false } },
      );
      expect((await owner.agent.get(routes.hotels.byId(hidden.id))).status).toBe(404);
    });
  });

  describe("session tokens", () => {
    const bearer = (app: TestApp, payload: Record<string, unknown>) =>
      `Bearer ${app.app.get(JwtService).sign(payload)}`;

    it("rejects a token for an account that no longer exists", async () => {
      const app = await boot();
      const res = await anonymous(app)
        .get(routes.users.me)
        .set("Authorization", bearer(app, { userId: new Types.ObjectId().toString() }));
      expect(res.status).toBe(401);
    });

    it.each([
      ["no user id", { other: "claim" }],
      ["a user id that is not an id", { userId: "abc" }],
      ["a user id that is not text", { userId: { $ne: null } }],
      ["a numeric user id", { userId: 12345 }],
    ])("rejects a token with %s", async (_name, payload) => {
      const app = await boot();
      const res = await anonymous(app)
        .get(routes.users.me)
        .set("Authorization", bearer(app, payload));
      expect(res.status).toBe(401);
    });

    it("rejects a token signed with another secret", async () => {
      const app = await boot();
      const forged = new JwtService({ secret: "some-other-secret" }).sign({
        userId: new Types.ObjectId().toString(),
      });
      const res = await anonymous(app)
        .get(routes.users.me)
        .set("Authorization", `Bearer ${forged}`);
      expect(res.status).toBe(401);
    });
  });

  describe("password policy for new accounts", () => {
    const register = (app: TestApp, password: string, email = newCredentials().email) =>
      anonymous(app)
        .post(routes.auth.register)
        .send({ ...newCredentials(), email, password });

    it.each([
      ["a password under 10 characters", "abcd1234Z"],
      ["a very common password", "password123"],
      ["a common password in another case", "Password1234"],
      ["a keyboard run", "qwertyuiop"],
      ["a run of digits", "1234567890"],
      ["one repeated character", "aaaaaaaaaaaa"],
      ["a run of letters", "abcdefghijkl"],
      ["a password over 72 characters", "x7!".repeat(25)],
    ])("rejects %s", async (_name, password) => {
      const app = await boot();
      const res = await register(app, password);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_FAILED");
      expect(res.body.errors.map((e: { field: string }) => e.field)).toContain("password");
      expect(await users(app).countDocuments()).toBe(0);
    });

    it("rejects a password equal to the email name", async () => {
      const app = await boot();
      const res = await register(app, "alexandria.smith", "alexandria.smith@example.test");
      expect(res.status).toBe(400);
    });

    it("explains the rule in the response", async () => {
      const app = await boot();
      const res = await register(app, "short");
      expect(res.body.errors).toEqual([
        { field: "password", message: "Password must be at least 10 characters" },
      ]);
    });

    it.each(["tulip-Harbour-92", "correct-horse-battery-staple", "k9#Lm2$vQz!x"])(
      "accepts %s",
      async (password) => {
        const app = await boot();
        expect((await register(app, password)).status).toBe(201);
      },
    );

    it("accepts a password of exactly 72 characters", async () => {
      const app = await boot();
      expect((await register(app, "x7!Ab".repeat(14) + "cd")).status).toBe(201);
    });

    it("does not apply the new rule to people who already have an account", async () => {
      const app = await boot();
      const old = await insertUser(app, { password: "abc123" });
      expect((await login(app, old.email, "abc123")).status).toBe(200);
    });
  });

  describe("password hashing cost", () => {
    it("hashes new passwords with the configured cost", async () => {
      const app = await boot({ BCRYPT_COST: "6" });
      const { user } = await registerUser(app);
      expect(bcrypt.getRounds(await storedHash(app, user._id))).toBe(6);
    });

    it("upgrades an older, cheaper hash when the user signs in", async () => {
      const app = await boot({ BCRYPT_COST: "6" });
      const account = await insertUser(app, { cost: 4 });
      const before = await storedHash(app, account.id);

      expect((await login(app, account.email, account.password)).status).toBe(200);

      const after = await storedHash(app, account.id);
      expect(after).not.toBe(before);
      expect(bcrypt.getRounds(after)).toBe(6);
      expect((await login(app, account.email, account.password)).status).toBe(200);
      expect(await storedHash(app, account.id)).toBe(after);
    });

    it("leaves a hash that is already strong enough alone", async () => {
      const app = await boot({ BCRYPT_COST: "5" });
      const account = await insertUser(app, { cost: 6 });
      const before = await storedHash(app, account.id);

      await login(app, account.email, account.password);

      expect(await storedHash(app, account.id)).toBe(before);
    });

    it("does not upgrade the hash after a failed sign-in", async () => {
      const app = await boot({ BCRYPT_COST: "6" });
      const account = await insertUser(app, { cost: 4 });
      const before = await storedHash(app, account.id);

      await login(app, account.email, "wrong-password");

      expect(await storedHash(app, account.id)).toBe(before);
    });
  });

  describe("failed sign-ins", () => {
    it("answers an unknown address and a wrong password in the same way", async () => {
      const app = await boot();
      const account = await insertUser(app);

      const unknown = await login(app, "nobody@example.test", "whatever-it-is");
      const wrong = await login(app, account.email, "whatever-it-is");

      expect(unknown.status).toBe(400);
      expect(wrong.status).toBe(unknown.status);
      expect(wrong.body.code).toBe(unknown.body.code);
      expect(wrong.body.message).toBe(unknown.body.message);
    });

    it("locks an account after repeated failures, with a Retry-After", async () => {
      const app = await boot({ AUTH_MAX_FAILED_LOGINS: "3" });
      const account = await insertUser(app);

      for (let i = 0; i < 3; i += 1) {
        expect((await login(app, account.email, "wrong-password")).status).toBe(400);
      }

      const locked = await login(app, account.email, account.password);
      expect(locked.status).toBe(429);
      expect(locked.body.code).toBe("TOO_MANY_REQUESTS");
      expect(Number(locked.headers["retry-after"])).toBeGreaterThan(0);
      expect(locked.headers["set-cookie"]).toBeUndefined();
    });

    it("locks an unknown address in the same way, so nothing is revealed", async () => {
      const app = await boot({ AUTH_MAX_FAILED_LOGINS: "3" });

      for (let i = 0; i < 3; i += 1) {
        expect((await login(app, "ghost@example.test", "wrong-password")).status).toBe(400);
      }
      expect((await login(app, "ghost@example.test", "wrong-password")).status).toBe(429);
    });

    it("does not lock other accounts", async () => {
      const app = await boot({ AUTH_MAX_FAILED_LOGINS: "2" });
      const target = await insertUser(app);
      const other = await insertUser(app);

      await login(app, target.email, "wrong-password");
      await login(app, target.email, "wrong-password");

      expect((await login(app, target.email, target.password)).status).toBe(429);
      expect((await login(app, other.email, other.password)).status).toBe(200);
    });

    it("forgets earlier failures after a successful sign-in", async () => {
      const app = await boot({ AUTH_MAX_FAILED_LOGINS: "3" });
      const account = await insertUser(app);

      await login(app, account.email, "wrong-password");
      await login(app, account.email, "wrong-password");
      expect((await login(app, account.email, account.password)).status).toBe(200);

      await login(app, account.email, "wrong-password");
      await login(app, account.email, "wrong-password");
      expect((await login(app, account.email, account.password)).status).toBe(200);
    });
  });

  describe("per-IP limits", () => {
    it("limits sign-in attempts from one address", async () => {
      const app = await boot({ AUTH_RATE_LIMIT: "3" });

      for (let i = 0; i < 3; i += 1) {
        expect((await login(app, `n${i}@example.test`, "wrong-password")).status).toBe(400);
      }

      const limited = await login(app, "n9@example.test", "wrong-password");
      expect(limited.status).toBe(429);
      expect(limited.body.code).toBe("TOO_MANY_REQUESTS");
    });

    it("limits registrations from one address", async () => {
      const app = await boot({ AUTH_RATE_LIMIT: "2" });
      const register = () => anonymous(app).post(routes.auth.register).send(newCredentials());

      expect((await register()).status).toBe(201);
      expect((await register()).status).toBe(201);
      expect((await register()).status).toBe(429);
    });

    it("does not limit other routes with the sign-in limit", async () => {
      const app = await boot({ AUTH_RATE_LIMIT: "1" });
      for (let i = 0; i < 5; i += 1) {
        expect((await anonymous(app).get(routes.hotels.list)).status).toBe(200);
      }
    });
  });
});
