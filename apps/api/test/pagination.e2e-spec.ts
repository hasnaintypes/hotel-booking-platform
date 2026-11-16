import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./support/create-app";
import {
  anonymous,
  insertBooking,
  insertHotel,
  registerAdmin,
  registerUser,
} from "./support/helpers";
import { routes } from "./support/routes";

/**
 * The cursor-pagination contract every list endpoint shares (ADR-024): a page is
 * `{ data, pageInfo }`, `nextCursor` is null on the last page, a cursor only works on the list that
 * minted it, and an unusable cursor or limit is a field-level validation failure.
 */
describe("cursor pagination", () => {
  let t: TestApp;
  let admin: Awaited<ReturnType<typeof registerAdmin>>;
  let guest: Awaited<ReturnType<typeof registerUser>>;
  let hotelId: string;

  beforeAll(async () => {
    t = await createTestApp();
    admin = await registerAdmin(t);
    guest = await registerUser(t);

    const hotels = [];
    for (let index = 1; index <= 5; index += 1) {
      hotels.push(
        await insertHotel(t, guest.user._id, {
          name: `Pagination Inn ${index}`,
          city: "Paginateville",
        }),
      );
    }
    hotelId = hotels[0].id;

    for (let index = 1; index <= 3; index += 1) {
      await insertBooking(t, guest.user._id, hotelId, { totalCost: 100 + index });
    }
  });
  afterAll(async () => {
    await t.close();
  });

  it("walks every row exactly once and ends without a cursor", async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;

    do {
      const res = await anonymous(t)
        .get(routes.hotels.list)
        .query({ limit: 2, ...(cursor ? { cursor } : {}) });
      expect(res.status).toBe(200);
      seen.push(...res.body.data.map((hotel: { _id: string }) => hotel._id));
      expect(res.body.pageInfo.hasMore).toBe(seen.length < 5);
      cursor = res.body.pageInfo.nextCursor;
      pages += 1;
    } while (cursor);

    expect(pages).toBe(3);
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
  });

  it("returns an empty page without a cursor when nothing matches", async () => {
    const res = await admin.agent.get(routes.bookings.list).query({ q: "no-such-guest-anywhere" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [], pageInfo: { hasMore: false, nextCursor: null } });
  });

  it("rejects a cursor minted by another list", async () => {
    const first = await guest.agent.get(routes.bookings.myBookings).query({ limit: 1 });
    expect(first.status).toBe(200);
    const cursor = first.body.pageInfo.nextCursor as string;
    expect(typeof cursor).toBe("string");

    const res = await admin.agent.get(routes.bookings.list).query({ cursor });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_FAILED");
    expect(res.body.errors).toEqual([{ field: "cursor", message: "Invalid cursor" }]);
  });

  it.each([
    ["not a cursor at all", "cursor=not-a-cursor", "cursor"],
    ["a limit below the range", "limit=0", "limit"],
    ["a limit above the range", "limit=101", "limit"],
    ["a non-numeric limit", "limit=lots", "limit"],
  ])("rejects %s with a field-level 400", async (_name, query, field) => {
    const res = await anonymous(t).get(`${routes.hotels.list}?${query}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_FAILED");
    expect(res.body.errors.map((error: { field: string }) => error.field)).toEqual([field]);
  });

  it("applies the same envelope and limit bounds to every list endpoint", async () => {
    const lists = [
      { path: routes.hotels.search, agent: anonymous(t) },
      { path: routes.reviews.list, agent: admin.agent },
      { path: routes.reconciliation.discrepancies, agent: admin.agent },
      { path: routes.insights.rollups, agent: admin.agent },
      { path: routes.myHotels.list, agent: guest.agent },
      { path: routes.bookings.forHotel(hotelId), agent: admin.agent },
    ];

    for (const { path, agent } of lists) {
      const res = await agent.get(path).query({ limit: 1 });
      expect(res.status, path).toBe(200);
      expect(Object.keys(res.body).sort(), path).toEqual(["data", "pageInfo"]);
      expect(Object.keys(res.body.pageInfo).sort(), path).toEqual(["hasMore", "nextCursor"]);
      expect(res.body.data.length, path).toBeLessThanOrEqual(1);

      const tooLarge = await agent.get(path).query({ limit: 101 });
      expect(tooLarge.status, path).toBe(400);
      expect(tooLarge.body.errors.map((error: { field: string }) => error.field)).toEqual([
        "limit",
      ]);
    }
  });
});
