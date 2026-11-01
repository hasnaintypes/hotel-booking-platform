import { Types } from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./support/create-app";
import { anonymous, insertHotel, registerUser } from "./support/helpers";
import { routes } from "./support/routes";
import { applyFields, hotelFields, jpegBytes, type FieldValue } from "./support/hotel-form";

// Plain JSON equivalent of hotelFields, for requests that are not multipart.
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

  const stored = (id: string) =>
    t.connection.collection("hotels").findOne({ _id: new Types.ObjectId(id) });

  describe("create", () => {
    it("creates a hotel from the form the web app sends", async () => {
      const res = await applyFields(owner.agent.post(routes.myHotels.list), hotelFields()).attach(
        "imageFiles",
        jpegBytes(),
        { filename: "photo.jpg", contentType: "image/jpeg" },
      );

      expect(res.status).toBe(201);
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
      expect(t.cloudinary.uploadImages).toHaveBeenCalled();
    });

    it("accepts empty optional contact and policy fields", async () => {
      const res = await applyFields(
        owner.agent.post(routes.myHotels.list),
        hotelFields({
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
      const res = await applyFields(
        owner.agent.post(routes.myHotels.list),
        hotelFields({
          isFeatured: "true",
          isActive: "false",
          totalRevenue: "999999",
          totalBookings: "10",
          averageRating: "5",
          reviewCount: "50",
          occupancyRate: "99",
          userId: "000000000000000000000001",
          role: "admin",
        }),
      );
      expect(res.status).toBe(201);

      const row = await stored(res.body._id);
      expect(row).toMatchObject({
        userId: owner.user._id,
        isFeatured: false,
        isActive: true,
        totalRevenue: 0,
        totalBookings: 0,
        averageRating: 0,
        reviewCount: 0,
        occupancyRate: 0,
      });
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
      const res = await applyFields(owner.agent.post(routes.myHotels.list), hotelFields(overrides));
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_FAILED");
      expect(res.body.errors.map((e: { field: string }) => e.field)).toContain(field);
    });

    it("reports every missing required field at once", async () => {
      const res = await owner.agent.post(routes.myHotels.list).field("name", "Only a name");
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
      const res = await applyFields(anonymous(t).post(routes.myHotels.list), hotelFields());
      expect(res.status).toBe(401);
    });
  });

  describe("update", () => {
    it("updates the editable fields of the owner's hotel", async () => {
      const hotel = await insertHotel(t, owner.user._id, { name: "Old Name" });
      const res = await applyFields(
        owner.agent.put(routes.myHotels.byId(hotel.id)),
        hotelFields({ name: "New Name", pricePerNight: "150", starRating: "5" }),
      );

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ name: "New Name", pricePerNight: 150, starRating: 5 });
    });

    it("cannot change server-owned fields", async () => {
      const hotel = await insertHotel(t, owner.user._id, {
        isFeatured: true,
        totalRevenue: 500,
        averageRating: 4.5,
        isActive: true,
      });

      const res = await applyFields(
        owner.agent.put(routes.myHotels.byId(hotel.id)),
        hotelFields({
          isFeatured: "false",
          totalRevenue: "0",
          averageRating: "1",
          isActive: "false",
          userId: "000000000000000000000001",
        }),
      );
      expect(res.status).toBe(200);

      const row = await stored(hotel.id);
      expect(row).toMatchObject({
        userId: owner.user._id,
        isFeatured: true,
        totalRevenue: 500,
        averageRating: 4.5,
        isActive: true,
      });
    });

    it("does not let one owner edit another owner's hotel", async () => {
      const hotel = await insertHotel(t, owner.user._id, { name: "Mine" });
      const res = await applyFields(
        other.agent.put(routes.myHotels.byId(hotel.id)),
        hotelFields({ name: "Taken Over" }),
      );
      expect(res.status).toBe(404);
      expect((await stored(hotel.id))?.name).toBe("Mine");
    });

    it("rejects a malformed id and an unauthenticated caller", async () => {
      const bad = await applyFields(owner.agent.put(routes.myHotels.byId("abc")), hotelFields());
      expect(bad.status).toBe(400);

      const hotel = await insertHotel(t, owner.user._id);
      const anon = await applyFields(
        anonymous(t).put(routes.myHotels.byId(hotel.id)),
        hotelFields(),
      );
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
        const res = await owner.agent.put(routes.myHotels.byId(hotel.id)).send(body);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe("VALIDATION_FAILED");
      }

      expect(await stored(hotel.id)).toMatchObject({ name: "Untouched", city: "Leeds" });
    });

    it("rejects an operator object built with multipart bracket syntax", async () => {
      const hotel = await insertHotel(t, owner.user._id, { name: "Untouched" });
      const { name: _name, ...rest } = hotelFields();
      const res = await applyFields(owner.agent.put(routes.myHotels.byId(hotel.id)), rest).field(
        "name[$ne]",
        "x",
      );

      expect(res.status).toBe(400);
      expect(res.body.errors.map((e: { field: string }) => e.field)).toContain("name");
      expect((await stored(hotel.id))?.name).toBe("Untouched");
    });

    it("rejects an operator object when creating a hotel", async () => {
      const res = await owner.agent
        .post(routes.myHotels.list)
        .send(jsonFields({ name: { $ne: 1 } }));
      expect(res.status).toBe(400);
    });
  });
});
