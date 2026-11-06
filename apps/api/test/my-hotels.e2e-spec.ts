import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./support/create-app";
import { anonymous, hotelsRepository, insertHotel, registerUser } from "./support/helpers";
import { routes } from "./support/routes";
import { hotelFields, type FieldValue } from "./support/hotel-form";

// Plain JSON equivalent of hotelFields.
const jsonFields = (overrides: Record<string, unknown> = {}) => ({
  ...hotelFields(),
  "policies.petPolicy": "",
  "policies.smokingPolicy": "",
  ...overrides,
});

describe("owner hotel create and update", () => {
  let t: TestApp;
  let owner: Awaited<ReturnType<typeof registerUser>>;
  let other: Awaited<ReturnType<typeof registerUser>>;

  beforeAll(async () => {
    t = await createTestApp();
    owner = await registerUser(t);
    other = await registerUser(t);
  });
  afterAll(async () => {
    await t.close();
  });

  const stored = (id: string) => hotelsRepository(t).findById(id);

  describe("create", () => {
    it("creates a hotel from the JSON the web app sends", async () => {
      const res = await owner.agent
        .post(routes.myHotels.list)
        .send(jsonFields({ imageUrls: ["https://res.cloudinary.test/image-0.jpg"] }));

      expect(res.status).toBe(201);
      expect(res.headers.location).toBe(`/api/v1/manage/hotels/${res.body._id}`);
      expect(res.body).toMatchObject({
        name: "Harbour View",
        city: "Bristol",
        country: "United Kingdom",
        type: ["Hotel"],
        facilities: ["Free WiFi", "Pool"],
        pricePerNight: 120,
        starRating: 4,
        adultCount: 2,
        childCount: 1,
        userId: owner.user._id,
        isActive: true,
        isFeatured: false,
        imageUrls: ["https://res.cloudinary.test/image-0.jpg"],
        contact: { phone: "+44 117 000 000", email: "info@harbour.test" },
        policies: { checkInTime: "15:00", checkOutTime: "11:00" },
      });
    });

    it("accepts empty optional contact and policy fields", async () => {
      const res = await owner.agent.post(routes.myHotels.list).send(
        jsonFields({
          "contact.phone": "",
          "contact.email": "",
          "contact.website": "",
          "policies.checkInTime": "",
        }),
      );
      expect(res.status).toBe(201);
      expect(res.body.contact).toMatchObject({ phone: "", email: "", website: "" });
    });

    it("ignores server-owned fields sent by the caller", async () => {
      const res = await owner.agent.post(routes.myHotels.list).send(
        jsonFields({
          isFeatured: true,
          isActive: false,
          totalRevenue: 999999,
          totalBookings: 10,
          averageRating: 5,
          reviewCount: 50,
          occupancyRate: 99,
          userId: "00000000-0000-4000-8000-000000000001",
          role: "admin",
        }),
      );
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        userId: owner.user._id,
        isFeatured: false,
        isActive: true,
        totalRevenue: 0,
        totalBookings: 0,
        averageRating: 0,
        reviewCount: 0,
        occupancyRate: 0,
      });

      const row = await stored(res.body._id);
      expect(row?.ownerUserId).toBe(owner.user._id);
      expect(row?.status).toBe("active");
      expect(row?.isFeatured).toBe(false);
    });

    it.each<[string, Record<string, FieldValue>, string]>([
      ["a missing name", { name: "" }, "name"],
      ["a name over 100 characters", { name: "x".repeat(101) }, "name"],
      ["a description over 5000 characters", { description: "x".repeat(5001) }, "description"],
      ["a price of zero", { pricePerNight: "0" }, "pricePerNight"],
      ["a non-numeric price", { pricePerNight: "abc" }, "pricePerNight"],
      ["a missing price", { pricePerNight: undefined }, "pricePerNight"],
      ["a star rating of 9", { starRating: "9" }, "starRating"],
      ["a non-numeric star rating", { starRating: "abc" }, "starRating"],
      ["no adults", { adultCount: "0" }, "adultCount"],
      ["a negative child count", { childCount: "-1" }, "childCount"],
      ["no hotel type", { type: [] }, "type"],
      ["no facilities", { facilities: [] }, "facilities"],
      ["an invalid contact email", { "contact.email": "nope" }, "contact.email"],
      ["a script URL as website", { "contact.website": "javascript:alert(1)" }, "contact.website"],
      ["a script URL as an image", { imageUrls: ["javascript:alert(1)"] }, "imageUrls"],
    ])("rejects %s with a field-level 400", async (_name, overrides, field) => {
      const res = await owner.agent.post(routes.myHotels.list).send(jsonFields(overrides));
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_FAILED");
      expect(res.body.errors.map((e: { field: string }) => e.field)).toContain(field);
    });

    it("reports every missing required field at once", async () => {
      const res = await owner.agent.post(routes.myHotels.list).send({ name: "Only a name" });
      expect(res.status).toBe(400);
      const fields = res.body.errors.map((e: { field: string }) => e.field);
      expect(fields).toEqual(
        expect.arrayContaining([
          "city",
          "country",
          "description",
          "type",
          "facilities",
          "pricePerNight",
          "starRating",
          "adultCount",
          "childCount",
        ]),
      );
    });

    it("requires a signed-in user", async () => {
      const res = await anonymous(t).post(routes.myHotels.list).send(jsonFields());
      expect(res.status).toBe(401);
    });
  });

  describe("update", () => {
    it("updates the editable fields of the owner's hotel", async () => {
      const hotel = await insertHotel(t, owner.user._id, { name: "Old Name" });
      const res = await owner.agent
        .patch(routes.myHotels.byId(hotel.id))
        .send(jsonFields({ name: "New Name", pricePerNight: "150", starRating: "5" }));

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ name: "New Name", pricePerNight: 150, starRating: 5 });
    });

    it("cannot change server-owned fields", async () => {
      const hotel = await insertHotel(t, owner.user._id, {
        isFeatured: true,
        isActive: true,
        imageUrls: ["https://img.test/keep.jpg"],
      });

      const res = await owner.agent.patch(routes.myHotels.byId(hotel.id)).send(
        jsonFields({
          isFeatured: false,
          isActive: false,
          userId: "00000000-0000-4000-8000-000000000001",
        }),
      );
      expect(res.status).toBe(200);

      const row = await stored(hotel.id);
      expect(row).toMatchObject({
        ownerUserId: owner.user._id,
        isFeatured: true,
        status: "active",
      });
      expect(row?.images).toEqual(["https://img.test/keep.jpg"]);
    });

    it("does not let one owner edit another owner's hotel", async () => {
      const hotel = await insertHotel(t, owner.user._id, { name: "Mine" });
      const res = await other.agent
        .patch(routes.myHotels.byId(hotel.id))
        .send(jsonFields({ name: "Taken Over" }));
      expect(res.status).toBe(404);
      expect((await stored(hotel.id))?.name).toBe("Mine");
    });

    it("rejects a malformed id and an unauthenticated caller", async () => {
      const bad = await owner.agent.patch(routes.myHotels.byId("abc")).send(jsonFields());
      expect(bad.status).toBe(400);

      const hotel = await insertHotel(t, owner.user._id);
      const anon = await anonymous(t).patch(routes.myHotels.byId(hotel.id)).send(jsonFields());
      expect(anon.status).toBe(401);
    });
  });

  describe("operator payloads (CodeQL js/sql-injection alert on the update query)", () => {
    it("rejects an operator object in a JSON body and leaves the hotel untouched", async () => {
      const hotel = await insertHotel(t, owner.user._id, { name: "Untouched", city: "Leeds" });

      for (const body of [
        jsonFields({ name: { $ne: "x" } }),
        jsonFields({ city: { $gt: "" } }),
        jsonFields({ type: [{ $ne: null }] }),
        jsonFields({ pricePerNight: { $gt: 0 } }),
      ]) {
        const res = await owner.agent.patch(routes.myHotels.byId(hotel.id)).send(body);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe("VALIDATION_FAILED");
      }

      expect(await stored(hotel.id)).toMatchObject({ name: "Untouched", city: "Leeds" });
    });

    it("rejects an operator object when creating a hotel", async () => {
      const res = await owner.agent
        .post(routes.myHotels.list)
        .send(jsonFields({ name: { $ne: 1 } }));
      expect(res.status).toBe(400);
    });
  });
});
