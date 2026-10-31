import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./support/create-app";
import { anonymous, newCredentials, registerUser } from "./support/helpers";
import { routes } from "./support/routes";

const TRUSTED = "http://localhost:5174";
const UNTRUSTED = "https://evil.example";
const body = { kind: "hotel_description", input: "A cosy hotel" };

describe("request pipeline (CORS and origin guard)", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it("allows configured origins and sets CORS credentials headers", async () => {
    const res = await anonymous(t).get(routes.health).set("Origin", TRUSTED);
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe(TRUSTED);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("does not grant CORS access to unknown origins", async () => {
    const res = await anonymous(t).get(routes.health).set("Origin", UNTRUSTED);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  // The AI route is authenticated and unsafe (POST). With AI disabled it answers 503 once
  // every guard has passed, which distinguishes "blocked by the origin guard" (403)
  // from "reached the handler" (503).
  it("lets unsafe cookie-authenticated requests from a trusted origin reach the handler", async () => {
    const { agent } = await registerUser(t);
    const res = await agent.post(routes.ai.suggest).set("Origin", TRUSTED).send(body);
    expect(res.status).toBe(503);
  });

  it("rejects an untrusted Origin with a 403 problem response from the CORS layer", async () => {
    const { agent } = await registerUser(t);
    const res = await agent.post(routes.ai.suggest).set("Origin", UNTRUSTED).send(body);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CORS_ORIGIN_NOT_ALLOWED");
    expect(res.headers["content-type"]).toMatch(/application\/problem\+json/);
  });

  it("blocks unsafe cookie-authenticated requests whose Referer is untrusted", async () => {
    const { agent } = await registerUser(t);
    const res = await agent.post(routes.ai.suggest).set("Referer", `${UNTRUSTED}/page`).send(body);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Request origin not allowed");
  });

  // Characterises known exemptions (audit F-13), so a change to them is a conscious decision.
  describe("documented exemptions of the origin guard", () => {
    it("exempts Bearer-authenticated requests (Referer-only, so CORS does not intervene)", async () => {
      const credentials = newCredentials();
      await anonymous(t).post(routes.auth.register).send(credentials).expect(201);
      const login = await anonymous(t)
        .post(routes.auth.login)
        .send({ email: credentials.email, password: credentials.password });
      const cookie = (login.headers["set-cookie"] as unknown as string[]).find((c) =>
        c.startsWith("session_id="),
      )!;
      const token = cookie.split(";")[0].slice("session_id=".length);

      const res = await request(t.app.getHttpServer())
        .post(routes.ai.suggest)
        .set("Authorization", `Bearer ${token}`)
        .set("Referer", `${UNTRUSTED}/page`)
        .send(body);
      expect(res.status).toBe(503);
    });

    it("exempts requests that carry neither Origin nor Referer", async () => {
      const { agent } = await registerUser(t);
      const res = await agent.post(routes.ai.suggest).send(body);
      expect(res.status).toBe(503);
    });
  });
});
