import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./support/create-app";
import { anonymous, newCredentials, promoteToAdmin, registerUser } from "./support/helpers";
import { routes } from "./support/routes";

const sessionCookie = (res: { headers: Record<string, unknown> }) =>
  ((res.headers["set-cookie"] as string[] | undefined) ?? []).find((c) =>
    c.startsWith("session_id="),
  );

describe("auth and sessions", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it("registers a user and starts a cookie session", async () => {
    const credentials = newCredentials();
    const res = await anonymous(t).post(routes.auth.register).send(credentials);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      email: credentials.email,
      firstName: credentials.firstName,
      lastName: credentials.lastName,
    });
    expect(res.body).not.toHaveProperty("password");
    expect(res.headers.location).toBe("/api/v1/me");
    const cookie = sessionCookie(res);
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
  });

  it("rejects a duplicate registration with 409", async () => {
    const credentials = newCredentials();
    await anonymous(t).post(routes.auth.register).send(credentials).expect(201);
    const res = await anonymous(t).post(routes.auth.register).send(credentials);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CONFLICT");
    expect(res.body.message).toBe("User already exists");
  });

  it("lets exactly one of two identical registrations win", async () => {
    const credentials = newCredentials();
    const [first, second] = await Promise.all([
      anonymous(t).post(routes.auth.register).send(credentials),
      anonymous(t).post(routes.auth.register).send(credentials),
    ]);

    expect([first.status, second.status].sort()).toEqual([201, 409]);
    const conflict = first.status === 409 ? first : second;
    expect(conflict.body).toMatchObject({ code: "CONFLICT", message: "User already exists" });
  });

  it("validates registration input", async () => {
    const res = await anonymous(t)
      .post(routes.auth.register)
      .send({ email: "not-an-email", password: "x", firstName: "A", lastName: "B" });
    expect(res.status).toBe(400);
  });

  it("logs in with valid credentials and never returns the token in the body", async () => {
    const credentials = newCredentials();
    await anonymous(t).post(routes.auth.register).send(credentials).expect(201);

    const res = await anonymous(t)
      .post(routes.auth.login)
      .send({ email: credentials.email, password: credentials.password });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Login successful");
    expect(res.body.token).toBeUndefined();
    expect(sessionCookie(res)).toBeDefined();
  });

  it("rejects wrong credentials with a generic message", async () => {
    const credentials = newCredentials();
    await anonymous(t).post(routes.auth.register).send(credentials).expect(201);

    const wrongPassword = await anonymous(t)
      .post(routes.auth.login)
      .send({ email: credentials.email, password: "wrong-password-value" });
    const unknownUser = await anonymous(t)
      .post(routes.auth.login)
      .send({ email: "nobody@example.test", password: "whatever-password" });

    for (const res of [wrongPassword, unknownUser]) {
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Invalid Credentials");
    }
  });

  it("returns the current user without the password hash", async () => {
    const { agent, credentials } = await registerUser(t);
    const res = await agent.get(routes.users.me);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(credentials.email);
    expect(res.body.password).toBeUndefined();
  });

  it("updates the caller's profile through PATCH /me", async () => {
    const { agent } = await registerUser(t);
    const res = await agent
      .patch(routes.users.me)
      .send({ firstName: "Grace", lastName: "Hopper", phone: "+44 20 7946 0000" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      firstName: "Grace",
      lastName: "Hopper",
      phone: "+44 20 7946 0000",
    });
    expect(res.body.password).toBeUndefined();
    expect((await agent.get(routes.users.me)).body.firstName).toBe("Grace");
  });

  it("returns 401 for protected routes without a session", async () => {
    const res = await anonymous(t).get(routes.users.me);
    expect(res.status).toBe(401);
  });

  it("validates a session token and clears the cookie on logout", async () => {
    const { agent, credentials } = await registerUser(t);
    const validate = await agent.get(routes.users.me);
    expect(validate.status).toBe(200);
    expect(validate.body.email).toBe(credentials.email);

    const logout = await agent.post(routes.auth.logout);
    expect(logout.status).toBe(204);
    const cleared = sessionCookie(logout);
    expect(cleared).toMatch(/session_id=;/);

    // The agent honours the cleared cookie, so the next call is unauthenticated.
    const after = await agent.get(routes.users.me);
    expect(after.status).toBe(401);
  });

  it("denies admin routes to normal users and allows them for admins", async () => {
    const { agent, user } = await registerUser(t);
    const denied = await agent.get(routes.users.list);
    expect(denied.status).toBe(403);

    await promoteToAdmin(t, user._id);
    const allowed = await agent.get(routes.users.list);
    expect(allowed.status).toBe(200);
    expect(Array.isArray(allowed.body)).toBe(true);
  });
});
