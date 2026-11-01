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

const UNKNOWN_ID = "64b7f0f0f0f0f0f0f0f0f0f0";

const categories = { cleanliness: 4, service: 5, location: 4, value: 3, amenities: 4 };

const reviewBody = (
  hotelId: string,
  bookingId: string,
  overrides: Record<string, unknown> = {},
) => ({
  hotelId,
  bookingId,
  rating: 4,
  comment: "A comfortable stay with friendly staff.",
  categories,
  ...overrides,
});

describe("reviews", () => {
  let t: TestApp;
  let guest: Awaited<ReturnType<typeof registerUser>>;
  let other: Awaited<ReturnType<typeof registerUser>>;
  let owner: Awaited<ReturnType<typeof registerUser>>;
  let admin: Awaited<ReturnType<typeof registerAdmin>>;
  let hotelId: string;
  let otherHotelId: string;
  let bookingId: string;
  let reviewId: string;

  beforeAll(async () => {
    t = await createTestApp();
    guest = await registerUser(t);
    other = await registerUser(t);
    owner = await registerUser(t);
    admin = await registerAdmin(t);
    hotelId = (await insertHotel(t, owner.user._id, { name: "Reviewed Inn" })).id;
    otherHotelId = (await insertHotel(t, owner.user._id, { name: "Other Inn" })).id;
    bookingId = (await insertBooking(t, guest.user._id, hotelId)).id;
  });
  afterAll(async () => {
    await t.close();
  });

  describe("POST /api/reviews", () => {
    it("creates a verified review and updates the hotel's rating", async () => {
      const res = await guest.agent
        .post(routes.reviews.create)
        .send(reviewBody(hotelId, bookingId));
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        hotelId,
        bookingId,
        userId: guest.user._id,
        rating: 4,
        isVerified: true,
      });
      reviewId = res.body._id;

      const hotel = await anonymous(t).get(routes.hotels.byId(hotelId));
      expect(hotel.status).toBe(200);
      expect(hotel.body).toMatchObject({ averageRating: 4, reviewCount: 1 });
    });

    it("marks a review unverified when the booking was not paid", async () => {
      const unpaid = await insertBooking(t, guest.user._id, hotelId, { paymentStatus: "pending" });
      const res = await guest.agent
        .post(routes.reviews.create)
        .send(reviewBody(hotelId, unpaid.id, { rating: 2 }));
      expect(res.status).toBe(201);
      expect(res.body.isVerified).toBe(false);
    });

    it("rejects a second review for the same booking", async () => {
      const res = await guest.agent
        .post(routes.reviews.create)
        .send(reviewBody(hotelId, bookingId));
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("CONFLICT");
    });

    it("refuses a booking that belongs to someone else", async () => {
      const mine = await insertBooking(t, other.user._id, hotelId);
      const res = await guest.agent.post(routes.reviews.create).send(reviewBody(hotelId, mine.id));
      expect(res.status).toBe(403);
    });

    it("answers 404 for an unknown hotel", async () => {
      const res = await guest.agent
        .post(routes.reviews.create)
        .send(reviewBody(UNKNOWN_ID, bookingId));
      expect(res.status).toBe(404);
    });

    it("requires a session", async () => {
      const res = await anonymous(t)
        .post(routes.reviews.create)
        .send(reviewBody(hotelId, bookingId));
      expect(res.status).toBe(401);
    });

    it.each<[string, Record<string, unknown>, string]>([
      ["a rating of zero", { rating: 0 }, "rating"],
      ["a rating of six", { rating: 6 }, "rating"],
      ["a short comment", { comment: "ok" }, "comment"],
      ["a category out of range", { categories: { ...categories, service: 9 } }, "categories"],
    ])("rejects %s with a field-level 400", async (_name, overrides, field) => {
      const fresh = await insertBooking(t, guest.user._id, hotelId);
      const res = await guest.agent
        .post(routes.reviews.create)
        .send(reviewBody(hotelId, fresh.id, overrides));
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_FAILED");
      expect(res.body.errors.map((e: { field: string }) => e.field).join(",")).toContain(field);
    });

    it("rejects missing categories with 422 (known-bad: the DTO does not require the object)", async () => {
      // Characterisation: @ValidateNested() alone does not reject an absent property, so the
      // request reaches Mongoose and fails there with 422 instead of a field-level 400.
      const fresh = await insertBooking(t, guest.user._id, hotelId);
      const res = await guest.agent
        .post(routes.reviews.create)
        .send(reviewBody(hotelId, fresh.id, { categories: undefined }));
      expect(res.status).toBe(422);
      expect(res.body.code).toBe("UNPROCESSABLE");
      const fields = res.body.errors.map((e: { field: string }) => e.field);
      expect(fields.some((field: string) => field.startsWith("categories"))).toBe(true);
    });
  });

  describe("GET /api/reviews/hotel/:hotelId", () => {
    it("lists the hotel's reviews", async () => {
      const res = await anonymous(t).get(routes.reviews.byHotel(hotelId));
      expect(res.status).toBe(200);
      expect(res.body.map((review: { _id: string }) => review._id)).toContain(reviewId);
      for (const review of res.body) expect(review.hotelId).toBe(hotelId);
    });

    it("returns an empty list for a hotel with no reviews", async () => {
      const res = await anonymous(t).get(routes.reviews.byHotel(otherHotelId));
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe("GET /api/reviews/hotel/:hotelId/summary", () => {
    it("reports the rounded average and the count", async () => {
      const res = await anonymous(t).get(routes.reviews.summary(hotelId));
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ hotelId, averageRating: 3, reviewCount: 2 });
    });

    it("reports zero for a hotel with no reviews", async () => {
      const res = await anonymous(t).get(routes.reviews.summary(otherHotelId));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ hotelId: otherHotelId, averageRating: 0, reviewCount: 0 });
    });
  });

  describe("GET /api/reviews (admin list)", () => {
    it("lists reviews for an admin and honours the limit", async () => {
      const all = await admin.agent.get(routes.reviews.list);
      expect(all.status).toBe(200);
      expect(all.body.length).toBeGreaterThanOrEqual(2);

      const limited = await admin.agent.get(`${routes.reviews.list}?limit=1`);
      expect(limited.status).toBe(200);
      expect(limited.body).toHaveLength(1);
    });

    it("is closed to normal users and anonymous callers", async () => {
      expect((await guest.agent.get(routes.reviews.list)).status).toBe(403);
      expect((await anonymous(t).get(routes.reviews.list)).status).toBe(401);
    });
  });
});
