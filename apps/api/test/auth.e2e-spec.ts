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
    const res = await anonymous(t).post(routes.auth.register).send(newCredentials());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "User registered OK" });
    const cookie = sessionCookie(res);
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
  });

  it("rejects a duplicate registration with 400", async () => {
    const credentials = newCredentials();
    await anonymous(t).post(routes.auth.register).send(credentials).expect(200);
    const res = await anonymous(t).post(routes.auth.register).send(credentials);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("User already exists");
  });

  it("validates registration input", async () => {
    const res = await anonymous(t)
      .post(routes.auth.register)
      .send({ email: "not-an-email", password: "x", firstName: "A", lastName: "B" });
    expect(res.status).toBe(400);
  });

  it("logs in with valid credentials and never returns the token in the body", async () => {
    const credentials = newCredentials();
    await anonymous(t).post(routes.auth.register).send(credentials).expect(200);

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
    await anonymous(t).post(routes.auth.register).send(credentials).expect(200);

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

  it("returns 401 for protected routes without a session", async () => {
    const res = await anonymous(t).get(routes.users.me);
    expect(res.status).toBe(401);
  });

  it("validates a session token and clears the cookie on logout", async () => {
    const { agent, user } = await registerUser(t);
    const validate = await agent.get(routes.auth.validateToken);
    expect(validate.status).toBe(200);
    expect(validate.body.userId).toBe(user._id);

    const logout = await agent.post(routes.auth.logout);
    // Known inconsistency: logout answers 201 (Nest's POST default) while login answers 200.
    expect(logout.status).toBe(201);
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
