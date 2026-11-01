import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./support/create-app";
import { anonymous, insertHotel, registerAdmin, registerUser } from "./support/helpers";
import { routes } from "./support/routes";

const UNKNOWN_ID = "64b7f0f0f0f0f0f0f0f0f0f0";

describe("admin role and hotel state changes", () => {
  let t: TestApp;
  let user: Awaited<ReturnType<typeof registerUser>>;
  let other: Awaited<ReturnType<typeof registerUser>>;
  let owner: Awaited<ReturnType<typeof registerUser>>;
  let admin: Awaited<ReturnType<typeof registerAdmin>>;

  beforeAll(async () => {
    t = await createTestApp();
    user = await registerUser(t);
    other = await registerUser(t);
    owner = await registerUser(t);
    admin = await registerAdmin(t);
  });
  afterAll(async () => {
    await t.close();
  });

  describe("PATCH /api/users/:id/role", () => {
    it("lets an admin promote a user and the new role takes effect", async () => {
      const res = await admin.agent.patch(routes.users.role(user.user._id)).send({ role: "admin" });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ _id: user.user._id, role: "admin" });
      expect(res.body.password).toBeUndefined();

      expect((await user.agent.get(routes.users.list)).status).toBe(200);
      await admin.agent.patch(routes.users.role(user.user._id)).send({ role: "user" });
    });

    it("refuses to demote the acting admin", async () => {
      const res = await admin.agent.patch(routes.users.role(admin.user._id)).send({ role: "user" });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/own admin role/i);
    });

    it("rejects an unknown role and an unknown user", async () => {
      expect(
        (await admin.agent.patch(routes.users.role(other.user._id)).send({ role: "root" })).status,
      ).toBe(400);
      expect(
        (await admin.agent.patch(routes.users.role(UNKNOWN_ID)).send({ role: "admin" })).status,
      ).toBe(404);
    });

    it("is closed to non-admins and anonymous callers", async () => {
      expect(
        (await user.agent.patch(routes.users.role(other.user._id)).send({ role: "admin" })).status,
      ).toBe(403);
      expect(
        (await anonymous(t).patch(routes.users.role(user.user._id)).send({ role: "admin" })).status,
      ).toBe(401);
    });
  });

  describe("PATCH /api/hotels/:id/active", () => {
    it("lets an admin deactivate a hotel and hides it from guests", async () => {
      const hotel = await insertHotel(t, owner.user._id, { name: "Togglable Inn" });

      const res = await admin.agent.patch(routes.hotels.active(hotel.id)).send({ isActive: false });
      expect(res.status).toBe(200);
      expect(res.body.isActive).toBe(false);

      const guestView = await anonymous(t).get(routes.hotels.list);
      expect(guestView.body.map((h: { name: string }) => h.name)).not.toContain("Togglable Inn");

      await admin.agent.patch(routes.hotels.active(hotel.id)).send({ isActive: true });
    });

    it("requires a boolean and an existing hotel", async () => {
      const hotel = await insertHotel(t, owner.user._id);
      expect(
        (await admin.agent.patch(routes.hotels.active(hotel.id)).send({ isActive: "false" }))
          .status,
      ).toBe(400);
      expect(
        (await admin.agent.patch(routes.hotels.active(UNKNOWN_ID)).send({ isActive: false }))
          .status,
      ).toBe(404);
    });

    it("is closed to non-admins and anonymous callers", async () => {
      const hotel = await insertHotel(t, owner.user._id);
      expect(
        (await owner.agent.patch(routes.hotels.active(hotel.id)).send({ isActive: false })).status,
      ).toBe(403);
      expect(
        (await anonymous(t).patch(routes.hotels.active(hotel.id)).send({ isActive: false })).status,
      ).toBe(401);
    });
  });

  describe("PATCH /api/my-hotels/:id/active", () => {
    it("lets an owner toggle their own hotel", async () => {
      const hotel = await insertHotel(t, owner.user._id);
      const res = await owner.agent
        .patch(routes.myHotels.active(hotel.id))
        .send({ isActive: false });
      expect(res.status).toBe(200);
      expect(res.body.isActive).toBe(false);
    });

    it("answers 404 for another owner's hotel and 400 for a non-boolean", async () => {
      const hotel = await insertHotel(t, owner.user._id);
      expect(
        (await other.agent.patch(routes.myHotels.active(hotel.id)).send({ isActive: false }))
          .status,
      ).toBe(404);
      expect(
        (await owner.agent.patch(routes.myHotels.active(hotel.id)).send({ isActive: "false" }))
          .status,
      ).toBe(400);
    });

    it("requires a session", async () => {
      const hotel = await insertHotel(t, owner.user._id);
      expect(
        (await anonymous(t).patch(routes.myHotels.active(hotel.id)).send({ isActive: false }))
          .status,
      ).toBe(401);
    });
  });

  describe("GET /api/my-hotels/:id", () => {
    it("shows the hotel to its owner", async () => {
      const hotel = await insertHotel(t, owner.user._id, { name: "Owner Only" });

      const mine = await owner.agent.get(routes.myHotels.byId(hotel.id));
      expect(mine.status).toBe(200);
      expect(mine.body.name).toBe("Owner Only");
    });

    it("returns 200 with no data for another owner (known-bad: should be 404)", async () => {
      // Characterisation of current behaviour: the service returns null and the controller
      // does not translate it to a 404. Nothing leaks, but the status is inconsistent with
      // every other not-found path. Expected to be fixed with the M1-18 not-found work (#120).
      const hotel = await insertHotel(t, owner.user._id, { name: "Not Yours" });
      const res = await other.agent.get(routes.myHotels.byId(hotel.id));
      expect(res.status).toBe(200);
      expect(res.body?.name).toBeUndefined();
    });

    it("requires a session", async () => {
      const hotel = await insertHotel(t, owner.user._id);
      expect((await anonymous(t).get(routes.myHotels.byId(hotel.id))).status).toBe(401);
    });
  });
});
