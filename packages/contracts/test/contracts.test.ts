import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  adminHotelPageSchema,
  adminHotelSchema,
  adminUserListItemSchema,
  bookingCreationSchema,
  bookingDetailSchema,
  bookingSchema,
  cancelBookingResponseSchema,
  cancelBookingRequestSchema,
  createBookingRequestSchema,
  createOfferRequestSchema,
  cursorPageQuerySchema,
  cursorPageSchema,
  DEFAULT_PAGE_LIMIT,
  discrepancyPageSchema,
  discrepancySchema,
  hotelFormRequestSchema,
  hotelSearchQuerySchema,
  hotelStatsSchema,
  loginRequestSchema,
  manageHotelPageSchema,
  manageHotelSchema,
  pageInfoSchema,
  pageLimit,
  problemDetailsSchema,
  problemType,
  publicHotelSchema,
  publicUserSchema,
  registerRequestSchema,
  reviewSchema,
  reviewSummarySchema,
  suggestRequestSchema,
  toggleActiveRequestSchema,
  updateDiscrepancyRequestSchema,
  updateProfileRequestSchema,
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

describe("manageHotelSchema", () => {
  const manageHotel = {
    ...hotel,
    userId: hotel._id,
    totalBookings: 2,
    totalRevenue: 240,
    occupancyRate: 0,
    isActive: true,
    isFeatured: false,
  };

  const listItem = {
    ...manageHotel,
    upcomingBookings: 1,
    completedBookings: 1,
    cancelledBookings: 0,
  };

  it("adds ownership, counters and listing controls to the public shape", () => {
    expect(manageHotelSchema.parse(manageHotel)).toEqual(manageHotel);
  });

  it("accepts the supplier fallback of an empty owner id", () => {
    expect(manageHotelSchema.parse({ ...manageHotel, userId: "" }).userId).toBe("");
  });

  it("requires the dashboard counters only on the list row", () => {
    expect(manageHotelSchema.safeParse(listItem).success).toBe(true);
    expect(
      manageHotelPageSchema.safeParse({
        data: [manageHotel],
        pageInfo: { nextCursor: null, hasMore: false },
      }).success,
    ).toBe(false);

    const page = manageHotelPageSchema.parse({
      data: [listItem],
      pageInfo: { nextCursor: null, hasMore: false },
    });
    expect(page.data[0].upcomingBookings).toBe(1);
  });
});

describe("adminHotelSchema", () => {
  const manageHotel = {
    ...hotel,
    userId: hotel._id,
    totalBookings: 2,
    totalRevenue: 240,
    occupancyRate: 0,
    isActive: true,
    isFeatured: false,
  };

  const adminHotel = {
    ...manageHotel,
    ownerUserId: hotel._id,
    createdByUserId: hotel._id,
    organisationId: null,
    source: "managed",
    status: "active",
  };

  it("parses the wire shape, including the nullable ownership columns", () => {
    expect(adminHotelSchema.parse(adminHotel)).toEqual(adminHotel);
    expect(
      adminHotelSchema.parse({ ...adminHotel, ownerUserId: null, createdByUserId: null })
        .ownerUserId,
    ).toBeNull();
  });

  it("rejects an unknown status or source", () => {
    expect(adminHotelSchema.safeParse({ ...adminHotel, status: "published" }).success).toBe(false);
    expect(adminHotelSchema.safeParse({ ...adminHotel, source: "manual" }).success).toBe(false);
  });

  it("wraps a page of listings", () => {
    const page = adminHotelPageSchema.parse({
      data: [adminHotel],
      pageInfo: { nextCursor: null, hasMore: false },
    });
    expect(page.data).toHaveLength(1);
  });
});

describe("hotelStatsSchema", () => {
  it("parses the owner stats counters", () => {
    expect(
      hotelStatsSchema.parse({
        totalBookings: 2,
        totalRevenue: 240,
        averageRating: 4.5,
        reviewCount: 1,
      }),
    ).toEqual({ totalBookings: 2, totalRevenue: 240, averageRating: 4.5, reviewCount: 1 });
  });
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

describe("discrepancySchema", () => {
  const discrepancy = {
    id: "77777777-7777-4777-8777-777777777777",
    dedupeKey: `payment_status_mismatch:${booking._id}`,
    kind: "payment_status_mismatch",
    status: "open",
    provider: "stripe",
    bookingId: booking._id,
    paymentId: null,
    providerReference: "pi_123",
    details: { localStatus: "paid", providerStatus: "requires_capture" },
    detectedAt: "2026-05-03T09:00:00.000Z",
    resolvedAt: null,
    resolution: null,
    assignedToUserId: null,
    assignedAt: null,
    assignedByUserId: null,
    resolvedByUserId: null,
    createdAt: "2026-05-03T09:00:00.000Z",
    updatedAt: "2026-05-03T09:00:00.000Z",
  };

  it("parses the queue row, including the nulls the API returns", () => {
    expect(discrepancySchema.parse(discrepancy)).toEqual(discrepancy);
  });

  it("rejects an unknown kind or a closed row without a resolution timestamp", () => {
    expect(discrepancySchema.safeParse({ ...discrepancy, kind: "other" }).success).toBe(false);
    expect(discrepancySchema.safeParse({ ...discrepancy, detectedAt: "yesterday" }).success).toBe(
      false,
    );
  });

  it("wraps a page of findings", () => {
    const page = discrepancyPageSchema.parse({
      data: [discrepancy],
      pageInfo: { nextCursor: null, hasMore: false },
    });
    expect(page.data).toHaveLength(1);
  });
});

const hotelForm = {
  name: "  Harbour View  ",
  city: "Bristol",
  country: "United Kingdom",
  description: "A calm hotel by the water.",
  type: ["Hotel"],
  facilities: ["Free WiFi", "Pool"],
  pricePerNight: "120",
  starRating: "4",
  adultCount: "2",
  childCount: "1",
  "contact.phone": " +44 117 000 000 ",
  "contact.email": "info@harbour.test",
  "contact.website": "https://harbour.test",
  "policies.checkInTime": "15:00",
  "policies.checkOutTime": "11:00",
  "policies.cancellationPolicy": "Free cancellation for 24 hours",
  "policies.petPolicy": "",
  "policies.smokingPolicy": "",
};

describe("hotelFormRequestSchema", () => {
  it("parses the flat form the owner app posts", () => {
    expect(hotelFormRequestSchema.parse(hotelForm)).toEqual({
      ...hotelForm,
      name: "Harbour View",
      pricePerNight: 120,
      starRating: 4,
      adultCount: 2,
      childCount: 1,
      "contact.phone": "+44 117 000 000",
    });
  });

  it("accepts a single value where a list is expected and empty lists as nothing selected", () => {
    expect(hotelFormRequestSchema.parse({ ...hotelForm, type: "Hotel" }).type).toEqual(["Hotel"]);
    expect(
      hotelFormRequestSchema
        .safeParse({ ...hotelForm, type: "" })
        .error?.issues.map((issue) => issue.path[0]),
    ).toContain("type");
  });

  it("treats an empty optional field as cleared instead of invalid", () => {
    const parsed = hotelFormRequestSchema.parse({
      ...hotelForm,
      "contact.phone": "",
      "contact.email": "",
      "contact.website": "   ",
      imageUrls: "",
    });

    expect(parsed["contact.phone"]).toBe("");
    expect(parsed["contact.email"]).toBe("");
    expect(parsed["contact.website"]).toBe("");
    expect(parsed.imageUrls).toBeUndefined();
  });

  it("strips fields the owner may not set", () => {
    const parsed = hotelFormRequestSchema.parse({
      ...hotelForm,
      isFeatured: true,
      isActive: false,
      totalRevenue: 999,
      userId: booking.userId,
    });

    expect(parsed).not.toHaveProperty("isFeatured");
    expect(parsed).not.toHaveProperty("isActive");
    expect(parsed).not.toHaveProperty("totalRevenue");
    expect(parsed).not.toHaveProperty("userId");
  });

  it.each([
    [{ pricePerNight: "0" }, "pricePerNight"],
    [{ pricePerNight: "abc" }, "pricePerNight"],
    [{ pricePerNight: undefined }, "pricePerNight"],
    [{ starRating: "9" }, "starRating"],
    [{ starRating: "1.5" }, "starRating"],
    [{ adultCount: "0" }, "adultCount"],
    [{ childCount: "-1" }, "childCount"],
    [{ type: [] }, "type"],
    [{ facilities: [] }, "facilities"],
    [{ "contact.email": "nope" }, "contact.email"],
    [{ "contact.website": "javascript:alert(1)" }, "contact.website"],
    [{ imageUrls: ["javascript:alert(1)"] }, "imageUrls"],
    [{ name: "x".repeat(101) }, "name"],
  ])("rejects %j on %s", (overrides, field) => {
    const result = hotelFormRequestSchema.safeParse({ ...hotelForm, ...overrides });

    expect(result.success).toBe(false);
    expect(result.error!.issues.map((issue) => issue.path[0])).toContain(field);
  });

  it("rejects non-scalar values instead of forwarding an operator object", () => {
    expect(
      hotelFormRequestSchema.safeParse({ ...hotelForm, pricePerNight: { $gt: 0 } }).success,
    ).toBe(false);
    expect(hotelFormRequestSchema.safeParse({ ...hotelForm, name: { $ne: "x" } }).success).toBe(
      false,
    );
  });
});

describe("createBookingRequestSchema", () => {
  const stay = {
    hotelId: booking.hotelId,
    firstName: "  Gus  ",
    lastName: "Guest",
    email: " guest@example.test ",
    phone: "+44 20 7946 0000",
    adultCount: 2,
    childCount: 0,
    checkIn: "2026-06-13T00:00:00.000Z",
    checkOut: "2026-06-16T00:00:00.000Z",
    specialRequests: "  Quiet room  ",
  };

  it("trims text and accepts an explicit timezone offset", () => {
    const parsed = createBookingRequestSchema.parse({
      ...stay,
      checkIn: "2026-06-13T00:00:00+01:00",
    });

    expect(parsed.firstName).toBe("Gus");
    expect(parsed.email).toBe("guest@example.test");
    expect(parsed.specialRequests).toBe("Quiet room");
  });

  it("strips money and payment fields a client still sends", () => {
    const parsed = createBookingRequestSchema.parse({
      ...stay,
      totalCost: 1,
      paymentIntentId: "pi_client",
    });

    expect(parsed).not.toHaveProperty("totalCost");
    expect(parsed).not.toHaveProperty("paymentIntentId");
  });

  it.each([
    ["an invalid email", { email: "nope" }],
    ["a blank first name", { firstName: "   " }],
    ["a first name over 100 characters", { firstName: "x".repeat(101) }],
    ["an invalid phone number", { phone: "call me" }],
    ["special requests over 1000 characters", { specialRequests: "x".repeat(1001) }],
    ["a date without a time", { checkIn: "2026-06-13" }],
    ["a date that is not real", { checkIn: "2030-13-45T00:00:00.000Z" }],
    ["no adults", { adultCount: 0 }],
    ["a guest count sent as text", { adultCount: "2" }],
    ["a fractional guest count", { adultCount: 1.5 }],
    ["a hotel id that is not a UUID", { hotelId: "not-a-hotel" }],
  ])("rejects %s", (_name, overrides) => {
    expect(createBookingRequestSchema.safeParse({ ...stay, ...overrides }).success).toBe(false);
  });
});

describe("account request schemas", () => {
  const account = {
    firstName: "Alexandria",
    lastName: "Smith",
    email: "alexandria.smith@example.test",
    password: "tulip-Harbour-92",
  };

  it("reports a short registration password with the rule it breaks", () => {
    const result = registerRequestSchema.safeParse({ ...account, password: "short" });

    expect(result.error?.issues.map(({ path, message }) => ({ path, message }))).toEqual([
      { path: ["password"], message: "Password must be at least 10 characters" },
    ]);
  });

  it("rejects a common password and a password equal to the email name", () => {
    for (const password of ["password123", "alexandria.smith", "abcdefghijkl"]) {
      const result = registerRequestSchema.safeParse({ ...account, password });
      expect(result.error?.issues.map((issue) => issue.path[0])).toContain("password");
    }
  });

  it("accepts a registration password of exactly 72 characters", () => {
    expect(
      registerRequestSchema.safeParse({ ...account, password: "x7!Ab".repeat(14) + "cd" }).success,
    ).toBe(true);
  });

  it("keeps login looser than registration, so older accounts can sign in", () => {
    expect(loginRequestSchema.safeParse({ email: account.email, password: "123456" }).success).toBe(
      true,
    );
    expect(loginRequestSchema.safeParse({ email: account.email, password: "12345" }).success).toBe(
      false,
    );
  });

  it("leaves an omitted profile field out of the parsed body", () => {
    const parsed = updateProfileRequestSchema.parse({ firstName: "Grace" });

    expect(parsed).toEqual({ firstName: "Grace" });
    expect(parsed).not.toHaveProperty("image");
  });

  it("rejects a profile image that is not a loadable URL", () => {
    expect(updateProfileRequestSchema.safeParse({ image: "javascript:alert(1)" }).success).toBe(
      false,
    );
  });
});

describe("other request schemas", () => {
  it("requires a boolean for an active toggle", () => {
    expect(
      toggleActiveRequestSchema.safeParse({ isActive: "false" }).error?.issues[0]?.message,
    ).toBe("isActive boolean required");
    expect(toggleActiveRequestSchema.safeParse({ isActive: false }).success).toBe(true);
  });

  it("keeps a null assignee as an explicit unassignment", () => {
    expect(updateDiscrepancyRequestSchema.parse({ assignedToUserId: null })).toEqual({
      assignedToUserId: null,
    });
    expect(updateDiscrepancyRequestSchema.parse({})).not.toHaveProperty("assignedToUserId");
    expect(updateDiscrepancyRequestSchema.safeParse({ resolution: "ok" }).success).toBe(false);
  });

  it("describes an offer stay without any price", () => {
    const offer = createOfferRequestSchema.parse({
      hotelId: booking.hotelId,
      adultCount: 2,
      childCount: 0,
      checkIn: "2026-06-13T00:00:00.000Z",
      checkOut: "2026-06-16T00:00:00.000Z",
      totalPrice: 10,
    });

    expect(offer).not.toHaveProperty("totalPrice");
    expect(createOfferRequestSchema.safeParse({ ...offer, adultCount: 0 }).success).toBe(false);
  });

  it("treats a body-less request as an empty patch when every field is optional", () => {
    expect(cancelBookingRequestSchema.parse(undefined)).toEqual({});
    expect(updateProfileRequestSchema.parse(undefined)).toEqual({});
    expect(updateDiscrepancyRequestSchema.parse(undefined)).toEqual({});
    expect(cancelBookingRequestSchema.safeParse("not an object").success).toBe(false);
  });

  it("trims an assistant prompt and rejects a blank one", () => {
    expect(
      suggestRequestSchema.parse({ kind: "hotel_description", input: "  Cosy inn  " }).input,
    ).toBe("Cosy inn");
    expect(
      suggestRequestSchema.safeParse({ kind: "hotel_description", input: "   " }).error?.issues[0]
        ?.message,
    ).toBe("input must not be empty");
  });
});
