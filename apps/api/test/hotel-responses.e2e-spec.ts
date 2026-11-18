import { randomUUID } from "node:crypto";
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

const PUBLIC_HOTEL_KEYS = [
  "_id",
  "adultCount",
  "averageRating",
  "childCount",
  "city",
  "contact",
  "country",
  "createdAt",
  "description",
  "facilities",
  "imageUrls",
  "lastUpdated",
  "name",
  "policies",
  "pricePerNight",
  "reviewCount",
  "starRating",
  "type",
  "updatedAt",
].sort();

const MANAGE_HOTEL_KEYS = [
  ...PUBLIC_HOTEL_KEYS,
  "isActive",
  "isFeatured",
  "occupancyRate",
  "totalBookings",
  "totalRevenue",
  "userId",
].sort();

const MANAGE_HOTEL_LIST_KEYS = [
  ...MANAGE_HOTEL_KEYS,
  "upcomingBookings",
  "completedBookings",
  "cancelledBookings",
].sort();

const ADMIN_HOTEL_KEYS = [
  ...MANAGE_HOTEL_KEYS,
  "createdByUserId",
  "organisationId",
  "ownerUserId",
  "source",
  "status",
].sort();

const expectAllowList = (hotel: Record<string, unknown>, keys: string[]) => {
  expect(Object.keys(hotel).sort()).toEqual(keys);
};

describe("hotel response allow-lists", () => {
  let t: TestApp;
  let owner: Awaited<ReturnType<typeof registerUser>>;
  let guest: Awaited<ReturnType<typeof registerUser>>;
  let admin: Awaited<ReturnType<typeof registerAdmin>>;
  let hotel: { id: string; name: string };

  beforeAll(async () => {
    t = await createTestApp();
    owner = await registerUser(t);
    guest = await registerUser(t);
    admin = await registerAdmin(t);
    hotel = await insertHotel(t, owner.user._id, { name: "Allow List Inn" });
    await insertBooking(t, guest.user._id, hotel.id, { totalCost: 250 });
  });
  afterAll(async () => {
    await t.close();
  });

  it("returns only public fields from the catalogue list", async () => {
    const res = await anonymous(t).get(routes.hotels.list);
    expect(res.status).toBe(200);
    const listed = res.body.data.find((item: { _id: string }) => item._id === hotel.id);
    expect(listed).toBeDefined();
    expectAllowList(listed, PUBLIC_HOTEL_KEYS);
    expect(listed).not.toHaveProperty("userId");
    expect(listed).not.toHaveProperty("totalRevenue");
    expect(listed).not.toHaveProperty("totalBookings");
    expect(listed).not.toHaveProperty("isActive");
    expect(listed).not.toHaveProperty("isFeatured");
  });

  it("returns only public fields from search", async () => {
    const res = await anonymous(t).get(routes.hotels.search);
    expect(res.status).toBe(200);
    const listed = res.body.data.find((item: { _id: string }) => item._id === hotel.id);
    expect(listed).toBeDefined();
    expectAllowList(listed, PUBLIC_HOTEL_KEYS);
  });

  it("returns only public fields from hotel detail", async () => {
    const res = await anonymous(t).get(routes.hotels.byId(hotel.id));
    expect(res.status).toBe(200);
    expectAllowList(res.body, PUBLIC_HOTEL_KEYS);
    expect(res.body).not.toHaveProperty("userId");
    expect(res.body).not.toHaveProperty("totalRevenue");
    expect(res.body).not.toHaveProperty("totalBookings");
  });

  it("returns a flat booking page instead of embedding hotel fields", async () => {
    const res = await guest.agent.get(routes.bookings.myBookings);
    expect(res.status).toBe(200);
    const entry = res.body.data.find((item: { hotelId: string }) => item.hotelId === hotel.id);
    expect(entry).toBeDefined();
    expect(entry).not.toHaveProperty("bookings");
    expect(entry).not.toHaveProperty("name");
    expect(res.body.pageInfo).toEqual({ hasMore: false, nextCursor: null });
  });

  it("keeps owner counters and listing state on the manage response", async () => {
    const res = await owner.agent.get(routes.myHotels.byId(hotel.id));
    expect(res.status).toBe(200);
    expectAllowList(res.body, MANAGE_HOTEL_KEYS);
    expect(res.body.userId).toBe(owner.user._id);
    expect(res.body.totalBookings).toBe(1);
    expect(res.body.totalRevenue).toBe(250);
    expect(res.body.isActive).toBe(true);
  });

  it("adds the dashboard booking counts on the owner list row", async () => {
    const res = await owner.agent.get(routes.myHotels.list);
    expect(res.status).toBe(200);
    const listed = res.body.data.find((item: { _id: string }) => item._id === hotel.id);
    expect(listed).toBeDefined();
    expectAllowList(listed, MANAGE_HOTEL_LIST_KEYS);
    expect(listed.upcomingBookings).toBe(1);
    expect(listed.completedBookings).toBe(0);
    expect(listed.cancelledBookings).toBe(0);
  });

  it("keeps internal ownership and moderation fields on the admin response", async () => {
    const res = await admin.agent.get(routes.hotels.adminById(hotel.id));
    expect(res.status).toBe(200);
    expectAllowList(res.body, ADMIN_HOTEL_KEYS);
    expect(res.body.userId).toBe(owner.user._id);
    expect(res.body.ownerUserId).toBe(owner.user._id);
    expect(res.body.totalBookings).toBe(1);
    expect(res.body.status).toBe("active");
  });

  it("returns 404 for an unknown hotel and 400 for a malformed id", async () => {
    const unknown = await anonymous(t).get(routes.hotels.byId(randomUUID()));
    expect(unknown.status).toBe(404);
    expect(unknown.body.code).toBe("NOT_FOUND");

    const malformed = await anonymous(t).get(routes.hotels.byId("not-a-uuid"));
    expect(malformed.status).toBe(400);
    expect(malformed.body.code).toBe("VALIDATION_FAILED");
    expect(malformed.body.errors).toEqual([{ field: "id", message: "must be a valid id" }]);
  });
});
