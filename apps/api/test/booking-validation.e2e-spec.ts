import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./support/create-app";
import { insertHotel, registerUser } from "./support/helpers";
import { routes } from "./support/routes";

const DAY = 24 * 60 * 60 * 1000;
// One fixed reference time, so two dates built from it differ by exactly whole days. Calling
// Date.now() separately for check-in and check-out could add a millisecond to a stay, which
// rounds up to an extra night.
const NOW = Date.now();
const inDays = (days: number) => new Date(NOW + days * DAY).toISOString();

describe("booking input validation", () => {
  let t: TestApp;
  let guest: Awaited<ReturnType<typeof registerUser>>;
  let hotelId: string;

  const body = (overrides: Record<string, unknown> = {}) => ({
    firstName: "Gus",
    lastName: "Guest",
    email: "guest@example.test",
    phone: "+44 20 7946 0000",
    adultCount: 2,
    childCount: 1,
    checkIn: inDays(10),
    checkOut: inDays(12),
    totalCost: 200,
    paymentIntentId: "pi_test_ok",
    specialRequests: "Quiet room",
    ...overrides,
  });

  const book = (overrides: Record<string, unknown> = {}) =>
    guest.agent.post(routes.hotels.bookings(hotelId)).send(body(overrides));

  beforeAll(async () => {
    t = await createTestApp();
    guest = await registerUser(t);
    const owner = await registerUser(t);
    // Capacity: 2 adults and 1 child.
    hotelId = (await insertHotel(t, owner.user._id, { adultCount: 2, childCount: 1 })).id;
  });
  afterAll(async () => {
    await t.close();
  });

  beforeEach(() => {
    t.stripe.client.paymentIntents.retrieve.mockReset();
    t.stripe.client.paymentIntents.retrieve.mockResolvedValue({
      id: "pi_test_ok",
      status: "succeeded",
      metadata: { hotelId, userId: guest.user._id },
    });
  });

  it("accepts a valid booking and trims the text fields", async () => {
    const res = await book({ firstName: "  Gus  ", specialRequests: "  Quiet room  " });
    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/api/bookings/${res.body._id}`);
    expect(res.body).toMatchObject({
      firstName: "Gus",
      specialRequests: "Quiet room",
      hotelId,
      userId: guest.user._id,
      status: "confirmed",
      paymentStatus: "paid",
    });
  });

  it("accepts a booking with no phone or special requests", async () => {
    const res = await book({ phone: undefined, specialRequests: undefined });
    expect(res.status).toBe(201);
  });

  it("accepts a check-in of today and the maximum stay", async () => {
    const res = await book({ checkIn: inDays(0), checkOut: inDays(30) });
    expect(res.status).toBe(201);
  });

  it.each<[string, Record<string, unknown>, string]>([
    ["an invalid email", { email: "nope" }, "email"],
    ["an empty first name", { firstName: "   " }, "firstName"],
    ["a first name over 100 characters", { firstName: "x".repeat(101) }, "firstName"],
    ["an invalid phone number", { phone: "call me" }, "phone"],
    [
      "special requests over 1000 characters",
      { specialRequests: "x".repeat(1001) },
      "specialRequests",
    ],
    ["a check-in that is not an ISO date", { checkIn: "next friday" }, "checkIn"],
    ["a check-in that is not a real date", { checkIn: "2030-13-45T00:00:00.000Z" }, "checkIn"],
    ["a check-out that is not an ISO date", { checkOut: "soon" }, "checkOut"],
    ["a check-in in the past", { checkIn: inDays(-5), checkOut: inDays(-3) }, "checkIn"],
    ["a check-out before check-in", { checkIn: inDays(12), checkOut: inDays(10) }, "checkOut"],
    ["a check-out equal to check-in", { checkIn: inDays(10), checkOut: inDays(10) }, "checkOut"],
    ["a stay longer than 30 nights", { checkIn: inDays(10), checkOut: inDays(41) }, "checkOut"],
    ["no adults", { adultCount: 0 }, "adultCount"],
    ["more adults than the hotel allows", { adultCount: 3 }, "adultCount"],
    ["more children than the hotel allows", { childCount: 2 }, "childCount"],
    ["a fractional guest count", { adultCount: 1.5 }, "adultCount"],
    ["a guest count sent as text", { adultCount: "2" }, "adultCount"],
    ["a negative total", { totalCost: -1 }, "totalCost"],
    ["a total sent as text", { totalCost: "200" }, "totalCost"],
    [
      "a payment intent id that is not Stripe's",
      { paymentIntentId: "not_a_pi" },
      "paymentIntentId",
    ],
  ])("rejects %s with a field-level 400", async (_name, overrides, field) => {
    const res = await book(overrides);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_FAILED");
    expect(res.body.errors.map((e: { field: string }) => e.field)).toContain(field);
  });

  it("reports several problems at once", async () => {
    const res = await book({ checkIn: inDays(12), checkOut: inDays(10), adultCount: 9 });
    expect(res.status).toBe(400);
    const fields = res.body.errors.map((e: { field: string }) => e.field).sort();
    expect(fields).toEqual(["adultCount", "checkOut"]);
  });

  it("does not contact Stripe or create a booking for invalid input", async () => {
    const before = await t.connection.collection("bookings").countDocuments();
    await book({ email: "nope" });
    await book({ checkOut: inDays(5) });
    expect(t.stripe.client.paymentIntents.retrieve).not.toHaveBeenCalled();
    expect(await t.connection.collection("bookings").countDocuments()).toBe(before);
  });

  it("ignores fields a guest should not control", async () => {
    const res = await book({ status: "completed", paymentStatus: "refunded", userId: "someone" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: "confirmed",
      paymentStatus: "paid",
      userId: guest.user._id,
    });
  });
});

describe("payment intent night count", () => {
  let t: TestApp;
  let guest: Awaited<ReturnType<typeof registerUser>>;
  let hotelId: string;

  beforeAll(async () => {
    t = await createTestApp();
    guest = await registerUser(t);
    const owner = await registerUser(t);
    hotelId = (await insertHotel(t, owner.user._id, { pricePerNight: 100 })).id;
  });
  afterAll(async () => {
    await t.close();
  });

  const intent = (numberOfNights: unknown) =>
    guest.agent.post(routes.hotels.paymentIntent(hotelId)).send({ numberOfNights });

  it("prices whole nights up to the maximum", async () => {
    const res = await intent("3");
    expect(res.status).toBe(201);
    expect(res.body.totalCost).toBe(300);
    expect((await intent("30")).status).toBe(201);
  });

  it.each(["0", "-1", "1.5", "abc", "", "031", "1000", 3, null])("rejects %j", async (value) => {
    const res = await intent(value);
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e: { field: string }) => e.field)).toContain("numberOfNights");
  });

  it("rejects a stay over the configured maximum", async () => {
    const res = await intent("31");
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([
      { field: "numberOfNights", message: "a stay cannot exceed 30 nights" },
    ]);
    expect(t.stripe.client.paymentIntents.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ amount: 310_000 }),
    );
  });
});
