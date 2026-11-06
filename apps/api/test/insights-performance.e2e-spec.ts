import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { analyticsSnapshots, bookings, type Database } from "@hotel-booking/db";
import { DATABASE } from "../src/database/postgres.database";
import { createTestApp, type TestApp } from "./support/create-app";
import { insertHotel, registerAdmin, registerUser } from "./support/helpers";
import { routes } from "./support/routes";

const TOTAL_BOOKINGS = 100_000;
const CHUNK = 1_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const STATUSES = ["pending", "confirmed", "cancelled", "completed", "refunded"] as const;

describe("business insights at scale", () => {
  let t: TestApp;
  let admin: Awaited<ReturnType<typeof registerAdmin>>;

  beforeAll(async () => {
    t = await createTestApp();
    const db = t.app.get<Database>(DATABASE);
    await db.delete(analyticsSnapshots);

    const owner = await registerUser(t);
    admin = await registerAdmin(t);
    const hotel = await insertHotel(t, owner.user._id);
    const now = Date.now();

    for (let start = 0; start < TOTAL_BOOKINGS; start += CHUNK) {
      const rows = Array.from({ length: CHUNK }, (_, offset) => {
        const index = start + offset;
        return {
          ownerUserId: owner.user._id,
          createdByUserId: owner.user._id,
          hotelId: hotel.id,
          guestFirstName: "Scale",
          guestLastName: `Guest ${index}`,
          guestEmail: `scale-${index}@example.test`,
          adultCount: (index % 3) + 1,
          childCount: index % 2,
          checkIn: new Date(now + (index % 60) * DAY_MS),
          checkOut: new Date(now + ((index % 60) + 2) * DAY_MS),
          status: STATUSES[index % STATUSES.length],
          totalAmountMinor: 10_000 + (index % 500) * 100,
          currencyCode: "GBP",
          priceSnapshot: { totalCost: 100 + (index % 500) },
          createdAt: new Date(now - (index % 90) * DAY_MS),
          updatedAt: new Date(now - (index % 90) * DAY_MS),
        };
      });
      await db.insert(bookings).values(rows);
    }

    await db.execute(sql`vacuum (analyze) "bookings"`);
  }, 120_000);

  afterAll(async () => {
    await t.close();
  });

  it("has a created-at index for time-windowed analytics", async () => {
    const db = t.app.get<Database>(DATABASE);
    const result = await db.execute(sql`
      select indexname from pg_indexes
      where tablename = 'bookings' and indexname = 'bookings_created_at_idx'
    `);
    const rows = (result as unknown as { rows: Array<{ indexname: string }> }).rows ?? result;
    expect(rows).toHaveLength(1);
  });

  it("answers the dashboard within a bounded time over 100k bookings", async () => {
    const started = Date.now();
    const res = await admin.agent.get(routes.insights.dashboard);
    const elapsed = Date.now() - started;

    expect(res.status).toBe(200);
    expect(res.body.overview.totalBookings).toBe(TOTAL_BOOKINGS);
    expect(res.body.bookingStatusBreakdown).toHaveLength(STATUSES.length);
    expect(res.body.dailyBookings.length).toBeLessThanOrEqual(7);
    expect(elapsed).toBeLessThan(5000);
  });

  it("answers the forecast within a bounded time over 100k bookings", async () => {
    const started = Date.now();
    const res = await admin.agent.get(routes.insights.forecast);
    const elapsed = Date.now() - started;

    expect(res.status).toBe(200);
    expect(res.body.historical.length).toBeGreaterThan(0);
    expect(res.body.forecasts).toHaveLength(4);
    expect(elapsed).toBeLessThan(5000);
  });

  it("persists SQL-computed rollups in the snapshot table", async () => {
    const created = await admin.agent.post(routes.insights.rollups);
    expect(created.status).toBe(201);
    expect(created.body.metrics.totalBookings).toBe(TOTAL_BOOKINGS);
    expect(created.body.metrics.totalRevenue).toBeGreaterThan(0);
    expect(created.body.breakdown.byStatus.confirmed).toBeGreaterThan(0);

    const listed = await admin.agent.get(routes.insights.rollups);
    expect(listed.status).toBe(200);
    expect(listed.body.map((rollup: { _id: string }) => rollup._id)).toContain(created.body._id);
  });
});
