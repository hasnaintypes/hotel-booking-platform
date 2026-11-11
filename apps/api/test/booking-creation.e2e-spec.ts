import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { payments, type Database } from "@hotel-booking/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { IdempotencyRepository } from "../src/database/repositories/idempotency.repository";
import { DATABASE } from "../src/database/postgres.database";
import { createTestApp, type TestApp } from "./support/create-app";
import { anonymous, bookingsRepository, insertHotel, registerUser } from "./support/helpers";
import { routes } from "./support/routes";

const DAY = 24 * 60 * 60 * 1000;
// Fixed per run so two requests with the same idempotency key send byte-identical bodies.
const STAY = {
  checkIn: new Date(Date.now() + 10 * DAY).toISOString(),
  checkOut: new Date(Date.now() + 12 * DAY).toISOString(),
};

describe("booking creation (#52)", () => {
  let t: TestApp;
  let db: Database;
  let idempotency: IdempotencyRepository;
  let guest: Awaited<ReturnType<typeof registerUser>>;
  let other: Awaited<ReturnType<typeof registerUser>>;
  let owner: Awaited<ReturnType<typeof registerUser>>;
  let hotelId: string;

  const create = (key: string, overrides: Record<string, unknown> = {}) =>
    guest.agent
      .post(routes.bookings.create)
      .set("Idempotency-Key", key)
      .send({
        hotelId,
        firstName: "Gus",
        lastName: "Guest",
        email: "guest@example.test",
        adultCount: 1,
        childCount: 0,
        ...STAY,
        ...overrides,
      });

  const paymentRows = async (bookingId: string) =>
    db.select().from(payments).where(eq(payments.bookingId, bookingId));

  beforeAll(async () => {
    t = await createTestApp();
    db = t.app.get<Database>(DATABASE);
    idempotency = t.app.get(IdempotencyRepository);
    guest = await registerUser(t);
    other = await registerUser(t);
    owner = await registerUser(t);
    hotelId = (await insertHotel(t, owner.user._id, { pricePerNight: 125 })).id;
  });
  afterAll(async () => {
    await t.close();
  });

  beforeEach(() => {
    t.stripe.client.paymentIntents.create.mockClear();
  });

  it("creates a pending_payment booking from the server quote", async () => {
    const res = await create(randomUUID());

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: "pending_payment",
      paymentStatus: "pending",
      userId: guest.user._id,
      totalCost: 250,
    });

    const record = await bookingsRepository(t).findById(res.body._id);
    expect(record?.booking.inventorySource).toBe("managed");
    expect(record?.booking.totalAmountMinor).toBe(25_000);
    expect(record?.booking.priceSnapshot).toMatchObject({ version: 1, totalMinor: 25_000 });
  });

  it("creates the PaymentIntent for the snapshot total with booking metadata", async () => {
    const res = await create(randomUUID());
    const [payment] = await paymentRows(res.body._id);

    expect(t.stripe.client.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 25_000,
        currency: "gbp",
        metadata: { bookingId: res.body._id, publicReference: res.body.publicReference },
      }),
      expect.objectContaining({ idempotencyKey: `pi_${res.body._id}` }),
    );
    expect(payment).toMatchObject({
      amountMinor: 25_000,
      currencyCode: "GBP",
      status: "pending",
      idempotencyKey: `pi_${res.body._id}`,
    });
    expect(res.body.clientSecret).toBe("pi_secret_test");
  });

  it("replays a known key without a second booking or PaymentIntent", async () => {
    const key = randomUUID();
    const first = await create(key);
    const before = await bookingsRepository(t).count();

    const replay = await create(key);
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(first.body);
    expect(replay.headers.location).toBe(`/api/v1/bookings/${first.body.publicReference}`);
    expect(await bookingsRepository(t).count()).toBe(before);
    expect(t.stripe.client.paymentIntents.create).toHaveBeenCalledTimes(1);
  });

  it("falls back to the booking's idempotency key when the stored response is gone", async () => {
    const key = randomUUID();
    const first = await create(key);
    // Simulate an expired/cleared HTTP idempotency table.
    await idempotency.clear();
    t.stripe.client.paymentIntents.create.mockClear();
    const before = await bookingsRepository(t).count();

    const replay = await create(key);
    expect(replay.status).toBe(201);
    expect(replay.body._id).toBe(first.body._id);
    expect(replay.body.publicReference).toBe(first.body.publicReference);
    expect(await bookingsRepository(t).count()).toBe(before);
    expect(t.stripe.client.paymentIntents.create).not.toHaveBeenCalled();
  });

  it("rejects the same key with a different payload", async () => {
    const key = randomUUID();
    expect((await create(key)).status).toBe(201);

    const mismatch = await create(key, { adultCount: 2 });
    expect(mismatch.status).toBe(422);
  });

  it("polls by public reference with ownership checks", async () => {
    const created = await create(randomUUID());
    const reference = created.body.publicReference;

    const own = await guest.agent.get(routes.bookings.byReference(reference));
    expect(own.status).toBe(200);
    expect(own.body).toMatchObject({ _id: created.body._id, publicReference: reference });

    expect((await owner.agent.get(routes.bookings.byReference(reference))).status).toBe(200);
    expect((await other.agent.get(routes.bookings.byReference(reference))).status).toBe(403);
  });

  it("answers 404 for an unknown reference and 400 for a malformed one", async () => {
    const unknown = await guest.agent.get(routes.bookings.byReference(randomUUID()));
    expect(unknown.status).toBe(404);

    const missing = await guest.agent.get(routes.bookings.byReference("a".repeat(20)));
    expect(missing.status).toBe(404);

    const malformed = await guest.agent.get(routes.bookings.byReference("not-a-reference"));
    expect(malformed.status).toBe(400);

    expect((await anonymous(t).get(routes.bookings.byReference("a".repeat(20)))).status).toBe(401);
  });

  it("does not leak another user's booking through the reference", async () => {
    const created = await create(randomUUID());
    const res = await other.agent.get(routes.bookings.byReference(created.body.publicReference));
    expect(res.status).toBe(403);
    expect(res.body).not.toMatchObject({ _id: created.body._id });
  });
});
