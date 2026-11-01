import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./support/create-app";
import { anonymous, insertHotel, registerAdmin, registerUser } from "./support/helpers";
import { routes } from "./support/routes";

const SOME_ID = "64b7f0f0f0f0f0f0f0f0f0f0";

/**
 * Evidence for the CodeQL js/sql-injection alerts on the auth, bookings, hotels, reviews and
 * users services: a request that smuggles a Mongo operator object into a field is rejected by
 * validation before any query is built.
 */
describe("operator payloads are rejected before they reach a query", () => {
  let t: TestApp;
  let user: Awaited<ReturnType<typeof registerUser>>;
  let admin: Awaited<ReturnType<typeof registerAdmin>>;
  let hotelId: string;

  beforeAll(async () => {
    t = await createTestApp();
    user = await registerUser(t);
    admin = await registerAdmin(t);
    hotelId = (await insertHotel(t, user.user._id)).id;
  });
  afterAll(async () => {
    await t.close();
  });

  const expectRejected = (res: { status: number; body: any }, field?: string) => {
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_FAILED");
    if (field) {
      expect(res.body.errors.map((e: { field: string }) => e.field)).toContain(field);
    }
  };

  it("login: an operator in the email or password cannot match every account", async () => {
    expectRejected(
      await anonymous(t)
        .post(routes.auth.login)
        .send({ email: { $ne: null }, password: "123456" }),
      "email",
    );
    expectRejected(
      await anonymous(t)
        .post(routes.auth.login)
        .send({ email: "someone@example.test", password: { $ne: null } }),
      "password",
    );
    expectRejected(
      await anonymous(t)
        .post(routes.auth.login)
        .send({ email: ["someone@example.test"], password: "123456" }),
      "email",
    );
  });

  it("register: an operator in a field is rejected", async () => {
    expectRejected(
      await anonymous(t)
        .post(routes.auth.register)
        .send({
          email: { $gt: "" },
          password: "correct-horse-battery-staple",
          firstName: "A",
          lastName: "B",
        }),
      "email",
    );
  });

  it("booking status and payment updates: operators are not valid values", async () => {
    expectRejected(
      await user.agent.patch(routes.bookings.status(SOME_ID)).send({ status: { $ne: "x" } }),
      "status",
    );
    expectRejected(
      await user.agent
        .patch(routes.bookings.payment(SOME_ID))
        .send({ paymentStatus: "paid", paymentMethod: { $ne: null } }),
      "paymentMethod",
    );
    expectRejected(
      await user.agent
        .patch(routes.bookings.payment(SOME_ID))
        .send({ paymentStatus: { $ne: null } }),
      "paymentStatus",
    );
  });

  it("hotel activation: only a boolean is accepted, for admins and owners", async () => {
    expectRejected(
      await admin.agent.patch(routes.hotels.active(hotelId)).send({ isActive: { $ne: true } }),
      "isActive",
    );
    const owner = await user.agent
      .patch(routes.myHotels.active(hotelId))
      .send({ isActive: { $ne: true } });
    expect(owner.status).toBe(400);
  });

  it("hotel activation refuses lookalike values and still accepts real booleans", async () => {
    // These used to be coerced to `true` by implicit conversion and silently activate the hotel.
    for (const isActive of ["false", "true", 0, 1, null, {}, []]) {
      const res = await admin.agent.patch(routes.hotels.active(hotelId)).send({ isActive });
      expectRejected(res, "isActive");
    }

    const off = await admin.agent.patch(routes.hotels.active(hotelId)).send({ isActive: false });
    expect(off.status).toBe(200);
    expect(off.body.isActive).toBe(false);

    const on = await admin.agent.patch(routes.hotels.active(hotelId)).send({ isActive: true });
    expect(on.status).toBe(200);
    expect(on.body.isActive).toBe(true);
  });

  it("values are checked as sent, not coerced to text first", async () => {
    // An object password used to become the string "[object Object]" and fail only at bcrypt.
    expectRejected(
      await anonymous(t)
        .post(routes.auth.login)
        .send({ email: "someone@example.test", password: { $ne: null } }),
      "password",
    );
  });

  it("role updates: only a known role is accepted", async () => {
    expectRejected(
      await admin.agent.patch(routes.users.role(SOME_ID)).send({ role: { $ne: "user" } }),
      "role",
    );
  });

  it("reviews: ids must be real ids, not operator objects", async () => {
    expectRejected(
      await user.agent.post(routes.reviews.create).send({
        hotelId: { $ne: null },
        bookingId: { $ne: null },
        rating: 5,
        comment: "Lovely stay",
        categories: { cleanliness: 5, service: 5, location: 5, value: 5, amenities: 5 },
      }),
      "hotelId",
    );
  });

  it("a well-formed login with unknown credentials is still a plain failure, not an error", async () => {
    const res = await anonymous(t)
      .post(routes.auth.login)
      .send({ email: "nobody@example.test", password: "123456" });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid Credentials");
  });
});
