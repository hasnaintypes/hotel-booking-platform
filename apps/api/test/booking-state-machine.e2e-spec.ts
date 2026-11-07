import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bookingEvents, bookings, type Database } from "@hotel-booking/db";
import { DATABASE } from "../src/database/postgres.database";
import { BookingsRepository } from "../src/database/repositories/bookings.repository";
import {
  BookingTransitionConflictError,
  IllegalBookingTransitionError,
} from "../src/domain/bookings/booking-state-machine";
import { createTestApp, type TestApp } from "./support/create-app";
import { insertBooking, insertHotel, registerUser } from "./support/helpers";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("booking state machine against PostgreSQL", () => {
  let t: TestApp;
  let repository: BookingsRepository;
  let db: Database;
  let userId: string;
  let hotelId: string;

  beforeAll(async () => {
    t = await createTestApp();
    repository = t.app.get(BookingsRepository);
    db = t.app.get<Database>(DATABASE);
    const owner = await registerUser(t);
    userId = owner.user._id;
    hotelId = (await insertHotel(t, userId)).id;
  });

  afterAll(async () => {
    await t.close();
  });

  it("allows exactly one of many identical concurrent transitions", async () => {
    const { id } = await insertBooking(t, userId, hotelId, {
      status: "pending_payment",
      paymentStatus: "pending",
    });

    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        repository.transition({
          bookingId: id,
          from: "pending_payment",
          to: "authorized",
          actor: { type: "user", userId },
          requestId: `req-${id}`,
        }),
      ),
    );

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((result) => result.status === "rejected");
    expect(rejected).toHaveLength(7);
    for (const result of rejected) {
      expect((result as PromiseRejectedResult).reason).toBeInstanceOf(
        BookingTransitionConflictError,
      );
    }

    const [stored] = await db.select().from(bookings).where(eq(bookings.id, id));
    expect(stored?.status).toBe("authorized");
    expect(stored?.version).toBe(1);

    const events = await db.select().from(bookingEvents).where(eq(bookingEvents.bookingId, id));
    const transitions = events.filter((event) => event.requestId === `req-${id}`);
    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toMatchObject({
      fromStatus: "pending_payment",
      toStatus: "authorized",
      actorUserId: userId,
      metadata: {},
    });
  });

  it("rejects an illegal transition without changing the row or writing an event", async () => {
    const { id } = await insertBooking(t, userId, hotelId, { status: "confirmed" });
    const before = await db.select().from(bookingEvents).where(eq(bookingEvents.bookingId, id));

    await expect(
      repository.transition({
        bookingId: id,
        from: "confirmed",
        to: "pending_payment",
        actor: { type: "system", name: "test" },
      }),
    ).rejects.toBeInstanceOf(IllegalBookingTransitionError);

    const [stored] = await db.select().from(bookings).where(eq(bookings.id, id));
    expect(stored?.status).toBe("confirmed");
    expect(stored?.version).toBe(0);
    const after = await db.select().from(bookingEvents).where(eq(bookingEvents.bookingId, id));
    expect(after).toHaveLength(before.length);
  });
});
