import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./support/create-app";
import { anonymous, registerUser } from "./support/helpers";
import { routes } from "./support/routes";

const accessLogs = (t: TestApp) => t.logs.lines().filter((l) => "responseTime" in l);

describe("structured logging", () => {
  let t: TestApp;
  beforeAll(async () => {
    process.env.LOG_LEVEL = "debug";
    t = await createTestApp({ faults: true });
  });
  afterAll(async () => {
    await t.close();
    delete process.env.LOG_LEVEL;
  });
  beforeEach(() => t.logs.clear());

  it("writes one JSON access-log line per request with method, path, status and duration", async () => {
    await anonymous(t).get(routes.hotels.list);
    const [line] = accessLogs(t);
    expect(line).toMatchObject({
      level: "info",
      service: "hotel-booking-api",
      method: "GET",
      path: "/api/hotels",
      route: "/api/hotels",
      res: { statusCode: 200 },
    });
    expect(typeof line.responseTime).toBe("number");
    expect(typeof line.time).toBe("string");
  });

  it("generates a request id, echoes it and logs it", async () => {
    const res = await anonymous(t).get(routes.hotels.list);
    const id = res.headers["x-request-id"];
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(accessLogs(t)[0].requestId).toBe(id);
  });

  it("accepts a well-formed incoming request id and rejects unsafe ones", async () => {
    const good = await anonymous(t)
      .get(routes.hotels.list)
      .set("X-Request-Id", "edge-req-12345678");
    expect(good.headers["x-request-id"]).toBe("edge-req-12345678");

    for (const unsafe of [
      "short",
      "has spaces in it",
      `${"a".repeat(200)}`,
      "ok-but\tcontrol-chars",
    ]) {
      const res = await anonymous(t).get(routes.hotels.list).set("X-Request-Id", unsafe);
      expect(res.headers["x-request-id"]).not.toBe(unsafe);
      expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it("uses the route template, not the raw path, and never logs query strings", async () => {
    await anonymous(t).get(`${routes.hotels.search}?destination=SECRET-QUERY-VALUE`);
    const raw = t.logs.raw();
    expect(raw).not.toContain("SECRET-QUERY-VALUE");
    expect(accessLogs(t)[0]).toMatchObject({
      path: "/api/hotels/search",
      route: "/api/hotels/search",
    });
  });

  it("logs by outcome: 4xx at warn, 5xx at error", async () => {
    await anonymous(t).get(routes.users.me); // 401
    await anonymous(t).get("/__test__/boom"); // 500
    const levels = Object.fromEntries(accessLogs(t).map((l) => [l.res.statusCode, l.level]));
    expect(levels[401]).toBe("warn");
    expect(levels[500]).toBe("error");
  });

  it("does not log health checks", async () => {
    await anonymous(t).get(routes.health);
    expect(accessLogs(t)).toHaveLength(0);
  });

  it("adds the authenticated user id after authentication", async () => {
    const { agent, user } = await registerUser(t);
    t.logs.clear();
    await agent.get(routes.users.me);
    expect(accessLogs(t)[0].userId).toBe(user._id);
  });

  it("never writes secrets or credentials to the logs", async () => {
    const secrets = {
      password: "S3cret-P@ssw0rd-value",
      bearer: "bearer-token-abc123456789",
      cookie: "session_id=cookie-value-abc123456789",
    };
    await anonymous(t)
      .post(routes.auth.login)
      .set("Authorization", `Bearer ${secrets.bearer}`)
      .set("Cookie", secrets.cookie)
      .send({ email: "someone@example.test", password: secrets.password });

    const raw = t.logs.raw();
    for (const value of Object.values(secrets)) expect(raw).not.toContain(value);
  });
});
