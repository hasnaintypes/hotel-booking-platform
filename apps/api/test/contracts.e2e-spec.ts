import {
  hotelSearchResponseSchema,
  problemDetailsSchema,
  publicHotelPageSchema,
  publicHotelSchema,
} from "@hotel-booking/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "./support/create-app";
import { anonymous, insertHotel, registerUser } from "./support/helpers";
import { routes } from "./support/routes";

/**
 * The response-side half of the contract tests for the migrated endpoint group: the real HTTP
 * payloads must satisfy the schema that the OpenAPI document publishes and the clients import.
 */
describe("hotel contracts", () => {
  let t: TestApp;
  let hotel: { id: string; name: string };

  beforeAll(async () => {
    t = await createTestApp();
    const owner = await registerUser(t);
    hotel = await insertHotel(t, owner.user._id, { name: "Contract Inn", pricePerNight: 140 });
  });

  afterAll(async () => {
    await t.close();
  });

  it("returns a catalogue list that satisfies the published schema", async () => {
    const res = await anonymous(t).get(routes.hotels.list);

    expect(res.status).toBe(200);
    const parsed = publicHotelPageSchema.parse(res.body);
    expect(parsed.data.map((item) => item._id)).toContain(hotel.id);
    expect(parsed.pageInfo.nextCursor).toBeNull();
  });

  it("returns a search page that satisfies the published schema", async () => {
    const res = await anonymous(t).get(routes.hotels.search).query({ destination: "London" });

    expect(res.status).toBe(200);
    const page = hotelSearchResponseSchema.parse(res.body);
    expect(page.pageInfo.hasMore).toBe(false);
    expect(page.data.length).toBeGreaterThan(0);
  });

  it("returns one hotel that satisfies the published schema", async () => {
    const res = await anonymous(t).get(routes.hotels.byId(hotel.id));

    expect(res.status).toBe(200);
    const parsed = publicHotelSchema.parse(res.body);
    expect(parsed._id).toBe(hotel.id);
    // Dates are strings on the wire, not Date instances.
    expect(typeof parsed.createdAt).toBe("string");
  });

  it("documents what it returns: no field outside the schema", async () => {
    const res = await anonymous(t).get(routes.hotels.byId(hotel.id));

    const unknownKeys = Object.keys(res.body).filter((key) => !(key in publicHotelSchema.shape));
    expect(unknownKeys).toEqual([]);
  });

  it("returns a validation failure in the documented problem shape", async () => {
    const res = await anonymous(t).get(routes.hotels.search).query({ limit: "0" });

    expect(res.status).toBe(400);
    expect(res.headers["content-type"]).toMatch(/problem\+json/);

    const problem = problemDetailsSchema.parse(res.body);
    expect(problem.code).toBe("VALIDATION_FAILED");
    expect(problem.instance).toBe(routes.hotels.search);
    expect(problem.errors?.map((error) => error.field)).toContain("limit");
    expect(problem.type).toBe("urn:hotel-booking:problem:validation-failed");
  });

  it("reports an array element failure against the field, like the class-validator pipeline", async () => {
    const res = await anonymous(t).get(routes.hotels.search).query({ stars: "9" });

    expect(res.status).toBe(400);
    expect(res.body.errors.map((error: { field: string }) => error.field)).toEqual(["stars"]);
  });

  it("reports every invalid field at once", async () => {
    const res = await anonymous(t)
      .get(routes.hotels.search)
      .query({ limit: "0", adultCount: "-1", sortOption: "drop" });

    expect(res.status).toBe(400);
    const fields = res.body.errors.map((error: { field: string }) => error.field).sort();
    expect(fields).toEqual(["adultCount", "limit", "sortOption"]);
  });
});
