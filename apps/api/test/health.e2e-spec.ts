import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./support/create-app";
import { anonymous } from "./support/helpers";
import { routes } from "./support/routes";

describe("health", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it("reports healthy when the database is connected", async () => {
    const res = await anonymous(t).get(routes.health);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("healthy");
    expect(res.body.database.status).toBe("connected");
  });

  it("requires authentication for the detailed health report", async () => {
    const res = await anonymous(t).get(routes.healthDetailed);
    expect(res.status).toBe(401);
  });
});
