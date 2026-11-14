import { eq } from "drizzle-orm";
import { bookingEvents, bookings, type Database } from "@hotel-booking/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DATABASE } from "../src/database/postgres.database";
import {
  BOOKING_STATUSES,
  BOOKING_TRANSITIONS,
  type BookingStatus,
} from "../src/domain/bookings/booking-state-machine";
import { createTestApp, type TestApp } from "./support/create-app";
import { insertBooking, insertHotel, registerUser } from "./support/helpers";

/** Thrown to roll an allowed probe back without committing a status change. */
class Rollback extends Error {}

const allowed = (from: BookingStatus, to: BookingStatus): boolean =>
  (BOOKING_TRANSITIONS[from] as readonly BookingStatus[]).includes(to);

describe("database booking status guard", () => {
  let t: TestApp;
  let hotelId: string;
  let userId: string;

  beforeAll(async () => {
    t = await createTestApp();
    const owner = await registerUser(t);
    userId = owner.user._id;
    hotelId = (await insertHotel(t, userId, { name: "Guard Inn" })).id;
  });

  afterAll(async () => {
    await t.close();
  });

  it("accepts exactly the transitions the state machine allows", async () => {
    const db = t.app.get<Database>(DATABASE);
    const failures: string[] = [];

    for (const from of BOOKING_STATUSES) {
      for (const to of BOOKING_STATUSES) {
        if (from === to) continue;

        const { id } = await insertBooking(t, userId, hotelId, { status: from });
        let applied = true;

        try {
          await db.transaction(async (tx) => {
            await tx.update(bookings).set({ status: to }).where(eq(bookings.id, id));
            throw new Rollback();
          });
        } catch (error) {
          if (!(error instanceof Rollback)) applied = false;
        }

        if (applied !== allowed(from, to)) {
          failures.push(`${from} -> ${to}: database ${applied ? "allowed" : "rejected"} it`);
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it("rejects an illegal direct update with the guard's error", async () => {
    const db = t.app.get<Database>(DATABASE);
    const { id } = await insertBooking(t, userId, hotelId, { status: "pending_payment" });

    // Drizzle wraps driver failures, so the PostgreSQL error (and its constraint) is the cause.
    await expect(
      db.update(bookings).set({ status: "confirmed" }).where(eq(bookings.id, id)),
    ).rejects.toMatchObject({
      cause: {
        code: "23514",
        message: expect.stringMatching(/illegal booking status transition/),
      },
    });
  });

  it("records a same-status event only when it is marked as a note", async () => {
    const db = t.app.get<Database>(DATABASE);
    const { id } = await insertBooking(t, userId, hotelId, { status: "needs_review" });

    await expect(
      db.insert(bookingEvents).values({
        bookingId: id,
        fromStatus: "needs_review",
        toStatus: "needs_review",
        reason: "not a note",
      }),
    ).rejects.toThrow();

    const [note] = await db
      .insert(bookingEvents)
      .values({
        bookingId: id,
        fromStatus: "needs_review",
        toStatus: "needs_review",
        reason: "manual review recorded",
        metadata: { kind: "note" },
      })
      .returning();

    expect(note?.metadata).toMatchObject({ kind: "note" });
  });
});
