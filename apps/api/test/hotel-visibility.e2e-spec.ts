import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./support/create-app";
import { anonymous, insertHotel, registerAdmin, registerUser } from "./support/helpers";
import { routes } from "./support/routes";

const UNKNOWN_ID = "64b7f0f0f0f0f0f0f0f0f0f0";

function bookingBody(paymentIntentId = "pi_test_visibility") {
  return {
    firstName: "Gus",
    lastName: "Guest",
    email: "guest@example.test",
    adultCount: 1,
    childCount: 0,
    checkIn: "2030-01-01T00:00:00.000Z",
    checkOut: "2030-01-03T00:00:00.000Z",
    totalCost: 200,
    paymentIntentId,
  };
}

describe("inactive hotels", () => {
  let t: TestApp;
  let owner: Awaited<ReturnType<typeof registerUser>>;
  let other: Awaited<ReturnType<typeof registerUser>>;
  let admin: Awaited<ReturnType<typeof registerAdmin>>;
  let active: { id: string; name: string };
  let hidden: { id: string; name: string };

  beforeAll(async () => {
    t = await createTestApp();
    owner = await registerUser(t);
    other = await registerUser(t);
    admin = await registerAdmin(t);
    active = await insertHotel(t, owner.user._id, { name: "Visible Inn" });
    hidden = await insertHotel(t, owner.user._id, { name: "Hidden Inn", isActive: false });
  });
  afterAll(async () => {
    await t.close();
  });

  const names = (body: { name: string }[]) => body.map((h) => h.name);

  it("lists only active hotels for guests and ordinary users", async () => {
    const guest = await anonymous(t).get(routes.hotels.list);
    expect(guest.status).toBe(200);
    expect(names(guest.body)).toContain("Visible Inn");
    expect(names(guest.body)).not.toContain("Hidden Inn");

    const user = await other.agent.get(routes.hotels.list);
    expect(names(user.body)).not.toContain("Hidden Inn");
  });

  it("lists every hotel for admins", async () => {
    const res = await admin.agent.get(routes.hotels.list);
    expect(names(res.body)).toEqual(expect.arrayContaining(["Visible Inn", "Hidden Inn"]));
  });

  it("leaves inactive hotels out of search results", async () => {
    const res = await anonymous(t).get(routes.hotels.search);
    expect(res.status).toBe(200);
    expect(names(res.body.data)).toContain("Visible Inn");
    expect(names(res.body.data)).not.toContain("Hidden Inn");
    expect(res.body.pagination.total).toBeGreaterThanOrEqual(1);
  });

  it("answers 404 for an inactive hotel requested by a guest or another user", async () => {
    const guest = await anonymous(t).get(routes.hotels.byId(hidden.id));
    expect(guest.status).toBe(404);
    expect(guest.body.code).toBe("NOT_FOUND");

    const user = await other.agent.get(routes.hotels.byId(hidden.id));
    expect(user.status).toBe(404);
  });

  it("still shows an inactive hotel to its owner and to admins", async () => {
    const asOwner = await owner.agent.get(routes.hotels.byId(hidden.id));
    expect(asOwner.status).toBe(200);
    expect(asOwner.body.name).toBe("Hidden Inn");

    const asAdmin = await admin.agent.get(routes.hotels.byId(hidden.id));
    expect(asAdmin.status).toBe(200);
  });

  it("lists inactive hotels in the owner's own view", async () => {
    const res = await owner.agent.get(routes.myHotels.list);
    expect(names(res.body)).toEqual(expect.arrayContaining(["Visible Inn", "Hidden Inn"]));
  });

  it("serves an active hotel to everyone", async () => {
    const res = await anonymous(t).get(routes.hotels.byId(active.id));
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Visible Inn");
  });

  it("answers 404 instead of 200 with an empty body for an unknown hotel", async () => {
    const res = await anonymous(t).get(routes.hotels.byId(UNKNOWN_ID));
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });

  it("refuses payment intents for an inactive hotel", async () => {
    const res = await other.agent
      .post(routes.hotels.paymentIntent(hidden.id))
      .send({ numberOfNights: "2" });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/not available/i);
    expect(t.stripe.client.paymentIntents.create).not.toHaveBeenCalled();
  });

  it("still creates payment intents for an active hotel", async () => {
    const res = await other.agent
      .post(routes.hotels.paymentIntent(active.id))
      .send({ numberOfNights: "2" });
    expect(res.status).toBe(201);
    expect(res.body.totalCost).toBe(200);
  });

  it("refuses bookings for an inactive hotel without contacting Stripe", async () => {
    const res = await other.agent.post(routes.hotels.bookings(hidden.id)).send(bookingBody());
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/not available/i);
    expect(t.stripe.client.paymentIntents.retrieve).not.toHaveBeenCalled();
  });

  it("answers 404 for a booking against an unknown hotel", async () => {
    const res = await other.agent.post(routes.hotels.bookings(UNKNOWN_ID)).send(bookingBody());
    expect(res.status).toBe(404);
  });
});
