import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  adminUserListItemSchema,
  bookingCreationSchema,
  bookingDetailSchema,
  bookingSchema,
  cancelBookingResponseSchema,
  cursorPageQuerySchema,
  cursorPageSchema,
  DEFAULT_PAGE_LIMIT,
  hotelSearchQuerySchema,
  pageInfoSchema,
  pageLimit,
  problemDetailsSchema,
  problemType,
  publicHotelSchema,
  publicUserSchema,
  reviewSchema,
  reviewSummarySchema,
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
    expect(
      hotelSearchQuerySchema.parse({ destination: "", limit: "", cursor: "", stars: "" }),
    ).toEqual({});
  });

  it("parses numbers and repeated values from the query string", () => {
    const parsed = hotelSearchQuerySchema.parse({
      destination: "Paris",
      adultCount: "2",
      stars: ["4", "5"],
      types: ["Luxury", "Budget"],
      limit: "2",
      cursor: "abc",
    });

    expect(parsed).toEqual({
      destination: "Paris",
      adultCount: 2,
      stars: [4, 5],
      types: ["Luxury", "Budget"],
      limit: 2,
      cursor: "abc",
    });
  });

  it("accepts a single repeated value as a one-item list", () => {
    expect(hotelSearchQuerySchema.parse({ types: "Luxury" }).types).toEqual(["Luxury"]);
  });

  it("strips unknown keys instead of forwarding them", () => {
    expect(hotelSearchQuerySchema.parse({ isActive: "false", page: "1", offset: "10" })).toEqual(
      {},
    );
  });

  it("ignores operator-shaped values rather than failing or forwarding them", () => {
    expect(hotelSearchQuerySchema.parse({ destination: { $ne: "x" } })).toEqual({});
  });

  it.each([
    [{ limit: "0" }, "limit"],
    [{ limit: "101" }, "limit"],
    [{ limit: "1.5" }, "limit"],
    [{ limit: "abc" }, "limit"],
    [{ cursor: "x".repeat(513) }, "cursor"],
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

    expect(json.properties.limit).toEqual({ type: "integer", minimum: 1, maximum: 100 });
    expect(json.properties.cursor).toEqual({ type: "string", maxLength: 512 });
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

describe("cursorPageQuerySchema", () => {
  it("treats an empty limit and cursor as not provided", () => {
    expect(cursorPageQuerySchema.parse({ limit: "", cursor: "" })).toEqual({});
  });

  it("parses the limit from the query string", () => {
    expect(cursorPageQuerySchema.parse({ limit: "50", cursor: "abc" })).toEqual({
      limit: 50,
      cursor: "abc",
    });
    expect(pageLimit({})).toBe(DEFAULT_PAGE_LIMIT);
    expect(pageLimit({ limit: 50 })).toBe(50);
  });

  it.each([["0"], ["101"], ["1.5"], ["abc"]])("rejects limit=%s", (limit) => {
    const result = cursorPageQuerySchema.safeParse({ limit });

    expect(result.success).toBe(false);
    expect(result.error!.issues[0].path).toEqual(["limit"]);
  });
});

describe("pageInfoSchema", () => {
  it("accepts the last page and a following page", () => {
    expect(pageInfoSchema.parse({ nextCursor: null, hasMore: false })).toEqual({
      nextCursor: null,
      hasMore: false,
    });
    expect(pageInfoSchema.parse({ nextCursor: "abc", hasMore: true }).hasMore).toBe(true);
  });

  it("rejects a missing hasMore, so clients can never infer it", () => {
    expect(pageInfoSchema.safeParse({ nextCursor: null }).success).toBe(false);
  });

  it("wraps items with the page metadata", () => {
    const page = cursorPageSchema(publicHotelSchema).parse({
      data: [hotel],
      pageInfo: { nextCursor: null, hasMore: false },
    });

    expect(page.data[0]._id).toBe(hotel._id);
    expect(page.pageInfo.hasMore).toBe(false);
  });
});

const booking = {
  _id: "11111111-1111-4111-8111-111111111111",
  publicReference: "bkg_7f3a9c2e",
  userId: "22222222-2222-4222-8222-222222222222",
  hotelId: "33333333-3333-4333-8333-333333333333",
  inventorySource: "managed",
  firstName: "Guest",
  lastName: "Traveler",
  email: "guest@example.test",
  adultCount: 2,
  childCount: 0,
  checkIn: "2026-06-13T00:00:00.000Z",
  checkOut: "2026-06-16T00:00:00.000Z",
  totalCost: 540,
  status: "confirmed",
  allowedTransitions: ["cancelling", "cancelled", "needs_review"],
  paymentStatus: "paid",
  refundAmount: 0,
  createdAt: "2026-05-01T10:00:00.000Z",
  updatedAt: "2026-05-01T10:00:00.000Z",
};

describe("bookingSchema", () => {
  it("parses the wire shape with ISO dates", () => {
    expect(bookingSchema.parse(booking)).toEqual(booking);
  });

  it("rejects Date objects and unknown statuses", () => {
    expect(bookingSchema.safeParse({ ...booking, checkIn: new Date() }).success).toBe(false);
    expect(bookingSchema.safeParse({ ...booking, status: "booked" }).success).toBe(false);
    expect(bookingSchema.safeParse({ ...booking, paymentStatus: "authorized" }).success).toBe(
      false,
    );
  });

  it("rejects a booking without its public reference", () => {
    const { publicReference: _removed, ...rest } = booking;
    expect(bookingSchema.safeParse(rest).success).toBe(false);
  });

  it("adds the nullable client secret only on creation", () => {
    expect(
      bookingCreationSchema.parse({ ...booking, clientSecret: "pi_secret" }).clientSecret,
    ).toBe("pi_secret");
    expect(bookingCreationSchema.safeParse(booking).success).toBe(false);
  });

  it("parses the operator detail with events and ledger", () => {
    const detail = {
      ...booking,
      version: 2,
      events: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          fromStatus: null,
          toStatus: "confirmed",
          metadata: { source: "checkout" },
          createdAt: "2026-05-01T10:00:00.000Z",
        },
      ],
      payments: [
        {
          id: "55555555-5555-4555-8555-555555555555",
          kind: "charge",
          provider: "stripe",
          status: "paid",
          amountMinor: 54000,
          currencyCode: "gbp",
          createdAt: "2026-05-01T10:00:00.000Z",
          updatedAt: "2026-05-01T10:00:00.000Z",
        },
      ],
    };

    expect(bookingDetailSchema.parse(detail).events[0]?.fromStatus).toBeNull();
  });

  it("requires the refund decision on cancellation", () => {
    expect(cancelBookingResponseSchema.safeParse({ booking, refundAmount: 0 }).success).toBe(true);
    expect(cancelBookingResponseSchema.safeParse({ booking }).success).toBe(false);
  });
});

describe("reviewSchema", () => {
  const review = {
    _id: "66666666-6666-4666-8666-666666666666",
    userId: booking.userId,
    hotelId: booking.hotelId,
    bookingId: booking._id,
    rating: 5,
    comment: "Quiet and central.",
    categories: { cleanliness: 5, service: 4, location: 5, value: 4, amenities: 4 },
    isVerified: true,
    helpfulCount: 0,
    createdAt: "2026-05-02T10:00:00.000Z",
    updatedAt: "2026-05-02T10:00:00.000Z",
  };

  it("parses the wire shape and enforces the 1-5 rating bounds", () => {
    expect(reviewSchema.parse(review)).toEqual(review);
    expect(reviewSchema.safeParse({ ...review, rating: 6 }).success).toBe(false);
    expect(
      reviewSchema.safeParse({ ...review, categories: { ...review.categories, value: 0 } }).success,
    ).toBe(false);
  });

  it("documents the rating summary", () => {
    expect(
      reviewSummarySchema.parse({ hotelId: booking.hotelId, averageRating: 4.5, reviewCount: 2 }),
    ).toEqual({ hotelId: booking.hotelId, averageRating: 4.5, reviewCount: 2 });
  });
});

describe("publicUserSchema", () => {
  const user = {
    _id: booking.userId,
    email: "guest@example.test",
    firstName: "Guest",
    lastName: "Traveler",
    role: "user",
    isActive: true,
    emailVerified: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  it("never carries credentials or internal columns", () => {
    const parsed = publicUserSchema.parse({ ...user, password: "x", address: { city: "London" } });
    expect(parsed).toEqual(user);
  });

  it("adds the admin list counters on top of the account", () => {
    const row = adminUserListItemSchema.parse({ ...user, totalBookings: 3, totalSpent: 1080 });
    expect(row.totalSpent).toBe(1080);
    expect(adminUserListItemSchema.safeParse(user).success).toBe(false);
  });

  it("rejects an unknown role", () => {
    expect(publicUserSchema.safeParse({ ...user, role: "owner" }).success).toBe(false);
  });
});
