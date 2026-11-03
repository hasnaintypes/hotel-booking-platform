import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./support/create-app";
import { anonymous, registerAdmin, registerUser } from "./support/helpers";
import { routes } from "./support/routes";

describe("audience route groups", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it("serves the public/customer group under /api/v1", async () => {
    const res = await anonymous(t).get(routes.hotels.list);
    expect(res.status).toBe(200);
  });

  it("serves the manage group under /api/v1/manage", async () => {
    const user = await registerUser(t);
    const res = await user.agent.get(routes.myHotels.list);
    expect(res.status).toBe(200);
  });

  it("serves the admin group under /api/v1/admin", async () => {
    const admin = await registerAdmin(t);
    const res = await admin.agent.get(routes.users.list);
    expect(res.status).toBe(200);
  });

  it("serves the reserved partner group under /api/v1/partner", async () => {
    const res = await anonymous(t).get(routes.partner.capabilities);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ audience: "partner", available: false });
  });

  it("does not resolve legacy api/... controller literals", async () => {
    for (const legacy of ["/api/hotels", "/api/my-hotels", "/api/admin/users"]) {
      expect((await anonymous(t).get(legacy)).status, legacy).toBe(404);
    }
  });
});
