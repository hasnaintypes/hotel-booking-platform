import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { offers, type Database } from "@hotel-booking/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DATABASE } from "../src/database/postgres.database";
import { InventoryProviderRegistry } from "../src/modules/inventory/inventory-provider.registry";
import { OffersService } from "../src/modules/inventory/offers.service";
import { createTestApp, type TestApp } from "./support/create-app";
import { bookingsRepository, hotelsRepository, insertHotel, registerUser } from "./support/helpers";
import { MockSupplierInventoryProvider } from "./support/mock-supplier-inventory.provider";
import { routes } from "./support/routes";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const STAY = {
  checkIn: new Date(NOW + 10 * DAY).toISOString(),
  checkOut: new Date(NOW + 12 * DAY).toISOString(),
};

describe("offers and unified booking (#103)", () => {
  let t: TestApp;
  let db: Database;
  let guest: Awaited<ReturnType<typeof registerUser>>;
  let other: Awaited<ReturnType<typeof registerUser>>;
  let owner: Awaited<ReturnType<typeof registerUser>>;
  let hotelId: string;
  let offersService: OffersService;
  let mockSupplier: MockSupplierInventoryProvider;

  const quote = (overrides: Record<string, unknown> = {}) =>
    guest.agent.post(routes.offers.create).send({
      hotelId,
      adultCount: 1,
      childCount: 0,
      ...STAY,
      ...overrides,
    });

  const book = (offerId: string, overrides: Record<string, unknown> = {}, key = randomUUID()) =>
    guest.agent
      .post(routes.bookings.create)
      .set("Idempotency-Key", key)
      .send({
        offerId,
        hotelId,
        firstName: "Gus",
        lastName: "Guest",
        email: "guest@example.test",
        adultCount: 1,
        childCount: 0,
        ...STAY,
        ...overrides,
      });

  beforeAll(async () => {
    t = await createTestApp();
    db = t.app.get<Database>(DATABASE);
    offersService = t.app.get(OffersService);
    guest = await registerUser(t);
    other = await registerUser(t);
    owner = await registerUser(t);
    hotelId = (
      await insertHotel(t, owner.user._id, { pricePerNight: 125, adultCount: 2, childCount: 1 })
    ).id;

    mockSupplier = new MockSupplierInventoryProvider(hotelsRepository(t));
    t.app.get(InventoryProviderRegistry).register(mockSupplier);
  });
  afterAll(async () => {
    await t.close();
  });

  beforeEach(() => {
    t.stripe.client.paymentIntents.create.mockClear();
  });

  it("creates a persisted managed offer with server-computed money", async () => {
    const res = await quote();

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      source: "managed",
      hotelId,
      totalMinor: 25_000,
      totalCost: 250,
      currency: "GBP",
      rateOptions: [expect.objectContaining({ id: "managed-standard", boardBasis: "room_only" })],
    });
    expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const [row] = await db.select().from(offers).where(eq(offers.id, res.body.id));
    expect(row).toMatchObject({
      source: "managed",
      hotelId,
      createdByUserId: guest.user._id,
      totalAmountMinor: 25_000,
    });
    expect(row.priceSnapshot).toMatchObject({ totalMinor: 25_000 });
  });

  it("books the frozen offer and links it to the booking", async () => {
    const quoted = await quote();
    const res = await book(quoted.body.id);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      offerId: quoted.body.id,
      inventorySource: "managed",
      status: "pending_payment",
      totalCost: 250,
    });

    const record = await bookingsRepository(t).findById(res.body._id);
    expect(record?.booking.offerId).toBe(quoted.body.id);
    expect(record?.booking.priceSnapshot).toMatchObject({ totalMinor: 25_000 });
    expect(record?.booking.cancellationPolicySnapshot).toMatchObject({ source: "managed" });
  });

  it("returns the original booking when the same offer is submitted again", async () => {
    const quoted = await quote();
    const first = await book(quoted.body.id);
    const before = await bookingsRepository(t).count();

    const replay = await book(quoted.body.id, {}, randomUUID());
    expect(replay.status).toBe(201);
    expect(replay.body._id).toBe(first.body._id);
    expect(await bookingsRepository(t).count()).toBe(before);
    expect(t.stripe.client.paymentIntents.create).toHaveBeenCalledTimes(1);
  });

  it("rejects an offer that has expired", async () => {
    const quoted = await quote();
    const past = new Date(NOW - 2 * 60 * 60 * 1000);
    await db
      .update(offers)
      .set({ createdAt: past, expiresAt: new Date(NOW - 60 * 60 * 1000) })
      .where(eq(offers.id, quoted.body.id));

    const res = await book(quoted.body.id);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/expired/i);
  });

  it("does not let another guest book someone else's offer", async () => {
    const quoted = await other.agent
      .post(routes.offers.create)
      .send({ hotelId, adultCount: 1, childCount: 0, ...STAY });

    const res = await book(quoted.body.id);
    expect(res.status).toBe(403);
  });

  it("rejects an offer for a different stay", async () => {
    const quoted = await quote();
    const res = await book(quoted.body.id, {
      checkOut: new Date(NOW + 13 * DAY).toISOString(),
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_FAILED");
    expect(res.body.errors.map((error: { field: string }) => error.field)).toContain("offerId");
  });

  it("still quotes managed inventory when no offer id is supplied", async () => {
    const res = await guest.agent
      .post(routes.bookings.create)
      .set("Idempotency-Key", randomUUID())
      .send({
        hotelId,
        firstName: "Gus",
        lastName: "Guest",
        email: "guest@example.test",
        adultCount: 1,
        childCount: 0,
        ...STAY,
      });

    expect(res.status).toBe(201);
    expect(res.body.offerId).toMatch(/^[0-9a-f-]{36}$/);

    const record = await bookingsRepository(t).findById(res.body._id);
    expect(record?.booking.offerId).toBe(res.body.offerId);
  });

  it("cleans up expired offers but keeps offers that back a booking", async () => {
    const abandoned = await quote();
    const booked = await quote();
    await book(booked.body.id);

    const past = new Date(NOW - 2 * 60 * 60 * 1000);
    const expiredAt = new Date(NOW - 60 * 60 * 1000);
    await db
      .update(offers)
      .set({ createdAt: past, expiresAt: expiredAt })
      .where(eq(offers.id, abandoned.body.id));
    await db
      .update(offers)
      .set({ createdAt: past, expiresAt: expiredAt })
      .where(eq(offers.id, booked.body.id));

    const removed = await offersService.cleanupExpired(new Date());
    expect(removed).toBeGreaterThanOrEqual(1);

    const [abandonedRow] = await db.select().from(offers).where(eq(offers.id, abandoned.body.id));
    const [bookedRow] = await db.select().from(offers).where(eq(offers.id, booked.body.id));
    expect(abandonedRow).toBeUndefined();
    expect(bookedRow).toBeDefined();
  });

  it("books a mock supplier offer through the same path and cancels via the provider", async () => {
    const supplierOffer = await offersService.createOffer(
      { hotelId, adultCount: 1, childCount: 0, ...STAY },
      guest.user._id,
      "supplier",
    );

    const res = await book(supplierOffer.id);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      offerId: supplierOffer.id,
      inventorySource: "supplier",
      totalCost: 250,
    });

    const record = await bookingsRepository(t).findById(res.body._id);
    expect(record?.booking).toMatchObject({
      inventorySource: "supplier",
      supplierId: "mock-supplier",
      supplierReference: expect.stringMatching(/^mock-/),
    });

    const cancelled = await guest.agent
      .post(routes.bookings.cancel(res.body._id))
      .set("Idempotency-Key", randomUUID())
      .send({ cancellationReason: "Guest changed plans" });

    expect(cancelled.status).toBe(200);
    expect(cancelled.body.booking.status).toBe("cancelled");
    expect(mockSupplier.calls.cancel).toBe(1);
  });
});
