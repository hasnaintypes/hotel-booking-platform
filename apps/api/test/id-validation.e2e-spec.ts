import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./support/create-app";
import { anonymous, registerAdmin, registerUser } from "./support/helpers";
import { routes } from "./support/routes";

const GOOD_ID = "64b7f0f0f0f0f0f0f0f0f0f0";

describe("malformed ids", () => {
  let t: TestApp;
  let user: Awaited<ReturnType<typeof registerUser>>;
  let admin: Awaited<ReturnType<typeof registerAdmin>>;

  beforeAll(async () => {
    t = await createTestApp();
    user = await registerUser(t);
    admin = await registerAdmin(t);
  });
  afterAll(async () => {
    await t.close();
  });

  const expectInvalid = (res: { status: number; body: any }, field: string) => {
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_FAILED");
    expect(res.body.errors).toEqual([{ field, message: "must be a valid id" }]);
  };

  it("rejects a bad hotel id with 400 instead of a cast error", async () => {
    expectInvalid(await anonymous(t).get(routes.hotels.byId("not-an-id")), "id");
  });

  it("rejects an object-shaped or short id in a path", async () => {
    expectInvalid(await anonymous(t).get(routes.hotels.byId("abc")), "id");
    expectInvalid(await user.agent.get(routes.myHotels.byId("%7B%24ne%3Anull%7D")), "id");
  });

  it("rejects bad ids on booking, review and user routes", async () => {
    expectInvalid(await user.agent.get(routes.bookings.byId("abc")), "id");
    expectInvalid(await user.agent.get(routes.bookings.forHotel("abc")), "hotelId");
    expectInvalid(await anonymous(t).get(routes.reviews.byHotel("abc")), "hotelId");
    expectInvalid(await anonymous(t).get(routes.reviews.summary("abc")), "hotelId");
    expectInvalid(await admin.agent.patch(routes.users.role("abc")).send({ role: "user" }), "id");
  });

  it("rejects bad ids in a review body", async () => {
    const res = await user.agent.post(routes.reviews.create).send({
      hotelId: "abc",
      bookingId: { $ne: null },
      rating: 5,
      comment: "Lovely stay",
      categories: { cleanliness: 5, service: 5, location: 5, value: 5, amenities: 5 },
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_FAILED");
    const fields = res.body.errors.map((e: { field: string }) => e.field).sort();
    expect(fields).toEqual(["bookingId", "hotelId"]);
  });

  it("lets a well-formed id that matches nothing through to a 404", async () => {
    const res = await anonymous(t).get(routes.hotels.byId(GOOD_ID));
    expect(res.status).toBe(404);
    const booking = await user.agent.get(routes.bookings.byId(GOOD_ID));
    expect(booking.status).toBe(404);
  });
});
