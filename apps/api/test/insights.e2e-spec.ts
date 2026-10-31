import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./support/create-app";
import { anonymous, insertHotel, registerAdmin, registerUser } from "./support/helpers";
import { routes } from "./support/routes";

describe("business insights", () => {
  let t: TestApp;
  let user: Awaited<ReturnType<typeof registerUser>>;
  let admin: Awaited<ReturnType<typeof registerAdmin>>;

  beforeAll(async () => {
    t = await createTestApp();
    user = await registerUser(t);
    admin = await registerAdmin(t);
    await insertHotel(t, user.user._id);
  });
  afterAll(async () => {
    await t.close();
  });

  const endpoints = [
    ["dashboard", routes.insights.dashboard],
    ["forecast", routes.insights.forecast],
    ["system stats", routes.insights.systemStats],
    ["rollups", routes.insights.rollups],
  ] as const;

  describe.each(endpoints)("%s", (_name, path) => {
    it("is closed to anonymous callers", async () => {
      const res = await anonymous(t).get(path);
      expect(res.status).toBe(401);
    });

    it("is forbidden to signed-in users who are not admins", async () => {
      const res = await user.agent.get(path);
      expect(res.status).toBe(403);
    });

    it("is available to admins", async () => {
      const res = await admin.agent.get(path);
      expect(res.status).toBe(200);
    });
  });

  it.each([
    "/api/business-insights/dashboard/public",
    "/api/business-insights/forecast/public",
    "/api/business-insights/system-stats/public",
  ])("no longer serves %s", async (path) => {
    expect((await anonymous(t).get(path)).status).toBe(404);
    expect((await admin.agent.get(path)).status).toBe(404);
  });

  describe("system stats", () => {
    it("reports only measured figures", async () => {
      const res = await admin.agent.get(routes.insights.systemStats);
      expect(res.status).toBe(200);

      expect(res.body.database).toEqual({
        totalHotels: 1,
        totalBookings: 0,
        totalRevenue: 0,
      });
      expect(Object.keys(res.body.application).sort()).toEqual([
        "thisWeekBookings",
        "todayBookings",
      ]);
      expect(res.body.system.memory).toEqual(
        expect.objectContaining({
          used: expect.any(Number),
          total: expect.any(Number),
          percentage: expect.any(Number),
        }),
      );
      expect(res.body.system.uptime).toEqual(expect.any(Number));
    });

    it("contains no simulated values", async () => {
      const body = JSON.stringify((await admin.agent.get(routes.insights.systemStats)).body);
      for (const invented of ["avgResponseTime", "requestsPerMinute", "errorRate", "99.9%"]) {
        expect(body).not.toContain(invented);
      }
    });

    it("returns the same figures on repeated requests", async () => {
      const first = (await admin.agent.get(routes.insights.systemStats)).body;
      const second = (await admin.agent.get(routes.insights.systemStats)).body;
      expect(second.database).toEqual(first.database);
      expect(second.application).toEqual(first.application);
    });
  });

  describe("rollups", () => {
    it("no longer stores a made-up conversion rate", async () => {
      const created = await admin.agent.post(routes.insights.rollups);
      expect(created.status).toBe(201);
      expect(created.body.metrics).not.toHaveProperty("conversionRate");

      const listed = await admin.agent.get(routes.insights.rollups);
      expect(JSON.stringify(listed.body)).not.toContain("conversionRate");
    });

    it("cannot be triggered by a non-admin", async () => {
      expect((await user.agent.post(routes.insights.rollups)).status).toBe(403);
      expect((await anonymous(t).post(routes.insights.rollups)).status).toBe(401);
    });
  });
});
