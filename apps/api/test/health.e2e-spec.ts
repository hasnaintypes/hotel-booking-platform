import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./support/create-app";
import { anonymous, registerAdmin, registerUser } from "./support/helpers";
import { routes } from "./support/routes";

describe("health", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it("reports liveness without touching the database", async () => {
    const res = await anonymous(t).get(routes.health);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("reports readiness from the databases and applied migrations", async () => {
    const res = await anonymous(t).get(routes.healthReady);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "ready",
      database: "connected",
      postgres: "connected",
      migrations: "ready",
    });
  });

  it("keeps detailed diagnostics out of the public and customer surface", async () => {
    const user = await registerUser(t);

    expect((await anonymous(t).get(routes.healthDetailed)).status).toBe(401);
    expect((await user.agent.get(routes.healthDetailed)).status).toBe(403);
  });

  it("serves detailed diagnostics to an administrator", async () => {
    const admin = await registerAdmin(t);
    const res = await admin.agent.get(routes.healthDetailed);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "healthy",
      checks: { database: "connected", postgres: "connected", migrations: "ready" },
      performance: {
        memory: {
          usedMb: expect.any(Number),
          totalMb: expect.any(Number),
          percentage: expect.any(Number),
        },
        uptime: expect.any(Number),
      },
    });
  });
});
