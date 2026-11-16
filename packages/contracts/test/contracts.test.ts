import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  hotelSearchQuerySchema,
  problemDetailsSchema,
  problemType,
  publicHotelSchema,
} from "../src";

const hotel = {
  _id: "0f8fad5b-d9cb-469f-a165-70867728950e",
  name: "Paris Nook",
  city: "Paris",
  country: "France",
  description: "A small hotel",
  type: ["Budget"],
  adultCount: 2,
  childCount: 0,
  facilities: ["wifi"],
  pricePerNight: 120.5,
  starRating: 4,
  imageUrls: ["https://example.test/1.jpg"],
  lastUpdated: "2026-01-01T00:00:00.000Z",
  contact: { phone: "", email: "", website: "" },
  policies: {
    checkInTime: "15:00",
    checkOutTime: "11:00",
    cancellationPolicy: "",
    petPolicy: "",
    smokingPolicy: "",
  },
  averageRating: 4.5,
  reviewCount: 2,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("hotelSearchQuerySchema", () => {
  it("treats empty values as not provided", () => {
    expect(hotelSearchQuerySchema.parse({ destination: "", page: "", stars: "" })).toEqual({});
  });

  it("parses numbers and repeated values from the query string", () => {
    const parsed = hotelSearchQuerySchema.parse({
      destination: "Paris",
      adultCount: "2",
      stars: ["4", "5"],
      types: ["Luxury", "Budget"],
      page: "2",
    });

    expect(parsed).toEqual({
      destination: "Paris",
      adultCount: 2,
      stars: [4, 5],
      types: ["Luxury", "Budget"],
      page: 2,
    });
  });

  it("accepts a single repeated value as a one-item list", () => {
    expect(hotelSearchQuerySchema.parse({ types: "Luxury" }).types).toEqual(["Luxury"]);
  });

  it("strips unknown keys instead of forwarding them", () => {
    expect(hotelSearchQuerySchema.parse({ isActive: "false", page: "1" })).toEqual({ page: 1 });
  });

  it("ignores operator-shaped values rather than failing or forwarding them", () => {
    expect(hotelSearchQuerySchema.parse({ destination: { $ne: "x" } })).toEqual({});
  });

  it.each([
    [{ page: "0" }, "page"],
    [{ page: "abc" }, "page"],
    [{ page: "1.5" }, "page"],
    [{ page: "1001" }, "page"],
    [{ maxPrice: "-1" }, "maxPrice"],
    [{ stars: "9" }, "stars"],
    [{ stars: "abc" }, "stars"],
    [{ adultCount: "-1" }, "adultCount"],
    [{ childCount: "100" }, "childCount"],
    [{ sortOption: "drop" }, "sortOption"],
    [{ destination: "x".repeat(101) }, "destination"],
    [{ types: "x".repeat(51) }, "types"],
    [{ stars: ["1", "2", "3", "4", "5", "6"] }, "stars"],
  ])("rejects %j on %s", (input, field) => {
    const result = hotelSearchQuerySchema.safeParse(input);
    expect(result.success).toBe(false);
    const paths = result.error!.issues.map((issue) => issue.path[0]);
    expect(paths).toContain(field);
  });

  it("documents as plain scalar query parameters", () => {
    const json = z.toJSONSchema(hotelSearchQuerySchema, { io: "input", target: "openapi-3.0" }) as {
      properties: Record<string, { type?: string }>;
    };

    expect(json.properties.page).toEqual({ type: "integer", minimum: 1, maximum: 1000 });
    expect(json.properties.destination).toEqual({ type: "string", maxLength: 100 });
  });
});

describe("publicHotelSchema", () => {
  it("parses the wire shape with ISO dates", () => {
    expect(publicHotelSchema.parse(hotel)).toEqual(hotel);
  });

  it("treats location as optional", () => {
    expect(publicHotelSchema.parse(hotel)).not.toHaveProperty("location");
    expect(publicHotelSchema.parse({ ...hotel, location: undefined }).location).toBeUndefined();
  });

  it("rejects Date objects, because responses carry ISO strings", () => {
    expect(publicHotelSchema.safeParse({ ...hotel, createdAt: new Date() }).success).toBe(false);
  });

  it.each(["name", "pricePerNight", "contact", "policies", "reviewCount"])(
    "rejects a response without %s",
    (key) => {
      const { [key as keyof typeof hotel]: _removed, ...rest } = hotel;
      expect(publicHotelSchema.safeParse(rest).success).toBe(false);
    },
  );
});

describe("problemDetailsSchema", () => {
  it("matches the ADR-024 body the API returns", () => {
    const problem = {
      type: problemType("VALIDATION_FAILED"),
      title: "Bad Request",
      status: 400,
      detail: "Request validation failed",
      instance: "/api/v1/hotels/search",
      code: "VALIDATION_FAILED" as const,
      requestId: "abc",
      errors: [{ field: "page", message: "Too small" }],
      message: "Request validation failed",
    };

    expect(problemDetailsSchema.parse(problem)).toEqual(problem);
    expect(problem.type).toBe("urn:hotel-booking:problem:validation-failed");
  });

  it("rejects a code that is not in the register", () => {
    expect(
      problemDetailsSchema.safeParse({
        type: "x",
        title: "x",
        status: 400,
        detail: "x",
        instance: "/",
        code: "NOPE",
        message: "x",
      }).success,
    ).toBe(false);
  });
});
