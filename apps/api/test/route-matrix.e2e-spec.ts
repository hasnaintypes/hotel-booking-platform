import { Types } from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ROUTE_TABLE } from "../src/common/routing/route-table";
import { createTestApp, type TestApp } from "./support/create-app";
import { anonymous } from "./support/helpers";
import { routes } from "./support/routes";

const id = new Types.ObjectId().toString();

type Case = {
  name: string;
  method: "get" | "post" | "put" | "patch" | "delete";
  path: string;
  status: number;
  /** Known gap with the milestone that closes it. */
  deviation?: string;
};

/**
 * The anonymous status for every route. Protected routes stop at the guard (401) before
 * validation or business logic, so this table is a cheap contract test for the whole surface.
 *
 * Remaining deviations, fixed when their routes are rebuilt:
 * - `POST /api/bookings/:id/cancel` returns 200; it becomes 201 when cancellation is modelled
 *   as a resource (M2).
 * - `POST /api/hotels/:hotelId/bookings/payment-intent` has no `Location` because the created
 *   Stripe object has no API route; the v1 route lands in M1-09.
 * - `POST /api/reviews` and `POST /api/analytics/rollups` have no `Location` because there is
 *   no GET-by-id route for either resource until M2.
 */
const MATRIX: Case[] = [
  { name: "health", method: "get", path: routes.health, status: 200 },
  { name: "detailed health", method: "get", path: routes.healthDetailed, status: 401 },

  { name: "register", method: "post", path: routes.auth.register, status: 400 },
  { name: "login", method: "post", path: routes.auth.login, status: 400 },
  { name: "logout", method: "post", path: routes.auth.logout, status: 204 },
  { name: "validate token", method: "get", path: routes.auth.validateToken, status: 401 },
  { name: "google start", method: "get", path: routes.auth.google, status: 302 },
  { name: "google callback", method: "get", path: routes.auth.googleCallback, status: 302 },

  { name: "current user", method: "get", path: routes.users.me, status: 401 },
  { name: "list users", method: "get", path: routes.users.list, status: 401 },
  { name: "update role", method: "patch", path: routes.users.role(id), status: 401 },

  { name: "list hotels", method: "get", path: routes.hotels.list, status: 200 },
  { name: "search hotels", method: "get", path: routes.hotels.search, status: 200 },
  { name: "hotel detail", method: "get", path: routes.hotels.byId(id), status: 404 },
  {
    name: "hotel detail invalid id",
    method: "get",
    path: routes.hotels.byId("not-an-id"),
    status: 400,
  },
  { name: "set hotel active", method: "patch", path: routes.hotels.active(id), status: 401 },
  { name: "payment intent", method: "post", path: routes.hotels.paymentIntent(id), status: 401 },
  { name: "create booking", method: "post", path: routes.hotels.bookings(id), status: 401 },

  { name: "list bookings", method: "get", path: routes.bookings.list, status: 401 },
  { name: "my bookings", method: "get", path: routes.bookings.myBookings, status: 401 },
  { name: "bookings for hotel", method: "get", path: routes.bookings.forHotel(id), status: 401 },
  { name: "booking detail", method: "get", path: routes.bookings.byId(id), status: 401 },
  { name: "cancel booking", method: "post", path: routes.bookings.cancel(id), status: 401 },
  { name: "update booking status", method: "patch", path: routes.bookings.status(id), status: 401 },
  {
    name: "update booking payment",
    method: "patch",
    path: routes.bookings.payment(id),
    status: 401,
  },
  { name: "delete booking", method: "delete", path: routes.bookings.byId(id), status: 401 },

  { name: "list reviews", method: "get", path: routes.reviews.list, status: 401 },
  { name: "hotel reviews", method: "get", path: routes.reviews.byHotel(id), status: 200 },
  { name: "hotel review summary", method: "get", path: routes.reviews.summary(id), status: 200 },
  { name: "create review", method: "post", path: routes.reviews.create, status: 401 },

  { name: "insights dashboard", method: "get", path: routes.insights.dashboard, status: 401 },
  { name: "insights forecast", method: "get", path: routes.insights.forecast, status: 401 },
  { name: "insights system stats", method: "get", path: routes.insights.systemStats, status: 401 },
  { name: "list rollups", method: "get", path: routes.insights.rollups, status: 401 },
  { name: "create rollup", method: "post", path: routes.insights.rollups, status: 401 },

  { name: "ai suggestions", method: "post", path: routes.ai.suggest, status: 401 },

  { name: "list my hotels", method: "get", path: routes.myHotels.list, status: 401 },
  { name: "create my hotel", method: "post", path: routes.myHotels.list, status: 401 },
  { name: "my hotel detail", method: "get", path: routes.myHotels.byId(id), status: 401 },
  { name: "set my hotel active", method: "patch", path: routes.myHotels.active(id), status: 401 },
  { name: "update my hotel", method: "put", path: routes.myHotels.byId(id), status: 401 },
];

describe("route status matrix", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it("covers the whole routed surface", () => {
    const segmentsOf = (path: string) => path.split("?")[0].split("/").filter(Boolean);
    const matches = (route: string[], path: string) => {
      const segments = segmentsOf(path);
      return (
        route.length === segments.length &&
        route.every((segment, index) => segment.startsWith(":") || segment === segments[index])
      );
    };

    const missing = ROUTE_TABLE.filter(
      (route) =>
        !MATRIX.some(
          (item) =>
            item.method.toUpperCase() === route.method && matches(route.segments, item.path),
        ),
    );
    expect(missing).toEqual([]);
  });

  it.each(MATRIX)("$name", async ({ method, path, status }) => {
    const res = await anonymous(t)[method](path);
    expect(res.status, `${method.toUpperCase()} ${path}`).toBe(status);
  });
});
