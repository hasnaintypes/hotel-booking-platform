import { Body, Controller, Post } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { idempotencyKeys, type Database } from "@hotel-booking/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Idempotent } from "../src/common/idempotency/idempotent.decorator";
import { IdempotencyRepository } from "../src/database/repositories/idempotency.repository";
import { DATABASE } from "../src/database/postgres.database";
import { createTestApp, type TestApp } from "./support/create-app";
import { anonymous, bookingsRepository, insertHotel, registerUser } from "./support/helpers";
import { routes } from "./support/routes";

const ROUTE = "/api/v1/__test_idempotency__/slow";

let runs = 0;
let releaseGate: (() => void) | undefined;
let markStarted: (() => void) | undefined;
let started: Promise<void> = Promise.resolve();

const armGate = () => {
  started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
};

const openGate = () => {
  releaseGate?.();
  releaseGate = undefined;
};

@Controller("__test_idempotency__")
class SlowIdempotencyController {
  @Post("slow")
  @Idempotent("test.idempotency.slow")
  async slow(@Body() body: Record<string, unknown>) {
    runs += 1;
    if (markStarted) {
      markStarted();
      markStarted = undefined;
      await new Promise<void>((resolve) => {
        releaseGate = resolve;
      });
    }
    return { ok: true, body };
  }
}

describe("HTTP idempotency", () => {
  let t: TestApp;
  let db: Database;
  let repository: IdempotencyRepository;

  beforeAll(async () => {
    t = await createTestApp({ controllers: [SlowIdempotencyController] });
    db = t.app.get<Database>(DATABASE);
    repository = t.app.get(IdempotencyRepository);
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    runs = 0;
    releaseGate = undefined;
    markStarted = undefined;
    started = Promise.resolve();
    await repository.clear();
  });

  const send = (key: string, body: Record<string, unknown>) =>
    anonymous(t).post(ROUTE).set("Idempotency-Key", key).send(body);

  it("replays the stored response and executes once", async () => {
    const body = { amount: 100, guest: "Gus" };

    const first = await send("replay-key", body);
    expect(first.status).toBe(201);
    expect(first.body).toEqual({ ok: true, body });

    const replay = await send("replay-key", body);
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(first.body);
    expect(runs).toBe(1);
  });

  it("replays a real booking without creating a second row or charging Stripe twice", async () => {
    const guest = await registerUser(t);
    const owner = await registerUser(t);
    const hotel = await insertHotel(t, owner.user._id);
    const paymentIntentId = `pi_test_${Date.now()}`;
    t.stripe.client.paymentIntents.retrieve.mockReset();
    t.stripe.client.paymentIntents.retrieve.mockResolvedValue({
      id: paymentIntentId,
      status: "succeeded",
      metadata: { hotelId: hotel.id, userId: guest.user._id },
    });
    const body = {
      hotelId: hotel.id,
      firstName: "Gus",
      lastName: "Guest",
      email: "guest@example.test",
      adultCount: 1,
      childCount: 0,
      checkIn: new Date(Date.now() + 10 * 86_400_000).toISOString(),
      checkOut: new Date(Date.now() + 12 * 86_400_000).toISOString(),
      totalCost: 200,
      paymentIntentId,
    };

    const before = await bookingsRepository(t).count();
    const first = await guest.agent
      .post(routes.bookings.create)
      .set("Idempotency-Key", "real-booking-key")
      .send(body);
    expect(first.status).toBe(201);

    const replay = await guest.agent
      .post(routes.bookings.create)
      .set("Idempotency-Key", "real-booking-key")
      .send(body);
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(first.body);
    expect(replay.headers.location).toBe(first.headers.location);
    expect(await bookingsRepository(t).count()).toBe(before + 1);
    expect(t.stripe.client.paymentIntents.retrieve).toHaveBeenCalledTimes(1);
  });

  it("treats a different payload with the same key as 422", async () => {
    expect((await send("mismatch-key", { amount: 100 })).status).toBe(201);

    const mismatch = await send("mismatch-key", { amount: 200 });
    expect(mismatch.status).toBe(422);
    expect(mismatch.body.code).toBe("UNPROCESSABLE");
    expect(runs).toBe(1);
  });

  it("returns 409 with Retry-After while an identical request is in flight", async () => {
    armGate();
    const body = { amount: 100 };

    const first = send("in-flight-key", body).then((response) => response);
    await started;

    const duplicate = await send("in-flight-key", body);
    expect(duplicate.status).toBe(409);
    expect(Number(duplicate.headers["retry-after"])).toBeGreaterThan(0);
    expect(runs).toBe(1);

    openGate();
    const completed = await first;
    expect(completed.status).toBe(201);

    const replay = await send("in-flight-key", body);
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(completed.body);
    expect(runs).toBe(1);
  });

  it("deletes keys past their TTL", async () => {
    const now = Date.now();
    await db.insert(idempotencyKeys).values({
      scope: "cleanup:anonymous",
      key: "expired-key",
      requestHash: "b".repeat(64),
      status: "completed",
      response: { statusCode: 200, body: { ok: true } },
      createdAt: new Date(now - 2 * 3_600_000),
      expiresAt: new Date(now - 3_600_000),
    });

    expect(await repository.deleteExpiredBefore(new Date())).toBe(1);
    expect(await repository.find("cleanup:anonymous", "expired-key")).toBeUndefined();
  });

  it("takes over an expired lease left by a crashed request", async () => {
    const key = "crashed-key";
    const body = { amount: 100 };
    expect((await send(key, body)).status).toBe(201);

    const [row] = await db
      .select()
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.key, key))
      .limit(1);
    expect(row?.status).toBe("completed");

    await db
      .update(idempotencyKeys)
      .set({
        status: "in_progress",
        response: null,
        lockedUntil: new Date(Date.now() - 1_000),
      })
      .where(eq(idempotencyKeys.id, row!.id));

    const retried = await send(key, body);
    expect(retried.status).toBe(201);
    expect(retried.body).toEqual({ ok: true, body });
    expect(runs).toBe(2);

    const [completed] = await db
      .select()
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.id, row!.id))
      .limit(1);
    expect(completed?.status).toBe("completed");
  });
});
