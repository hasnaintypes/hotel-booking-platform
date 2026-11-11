import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ROUTE_TABLE } from "../src/common/routing/route-table";
import { createTestApp, type TestApp } from "./support/create-app";
import { anonymous } from "./support/helpers";
import { routes } from "./support/routes";

const id = randomUUID();
const hotelId = randomUUID();

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
 * - `POST /api/v1/bookings/:id/cancellations` returns 200 until M2 gives cancellations a
 *   created-resource response.
 * - The temporary two-step checkout paths (`POST /api/v1/bookings/payment-intents` then
 *   `POST /api/v1/bookings`) are replaced by the single `POST /api/v1/bookings` flow in M2.
 * - `POST /api/v1/bookings/:id/reviews` and rollup creation have no `Location` because neither
 *   resource has a GET-by-id route yet.
 */
const MATRIX: Case[] = [
  { name: "liveness", method: "get", path: routes.health, status: 200 },
  { name: "readiness", method: "get", path: routes.healthReady, status: 200 },
  { name: "stripe webhook", method: "post", path: routes.webhooks.stripe, status: 400 },
  { name: "detailed health", method: "get", path: routes.healthDetailed, status: 401 },
  { name: "job metrics", method: "get", path: routes.jobs, status: 401 },

  { name: "register", method: "post", path: routes.auth.register, status: 400 },
  { name: "login", method: "post", path: routes.auth.login, status: 400 },
  { name: "logout", method: "post", path: routes.auth.logout, status: 204 },
  { name: "google start", method: "get", path: routes.auth.google, status: 302 },
  { name: "google callback", method: "get", path: routes.auth.googleCallback, status: 302 },

  { name: "current user", method: "get", path: routes.users.me, status: 401 },
  { name: "update current user", method: "patch", path: routes.users.me, status: 401 },
  { name: "list users", method: "get", path: routes.users.list, status: 401 },
  { name: "update user", method: "patch", path: routes.users.role(id), status: 401 },

  { name: "list hotels", method: "get", path: routes.hotels.list, status: 200 },
  { name: "list admin hotels", method: "get", path: routes.hotels.adminList, status: 401 },
  {
    name: "admin hotel detail",
    method: "get",
    path: routes.hotels.adminById(hotelId),
    status: 401,
  },
  { name: "search hotels", method: "get", path: routes.hotels.search, status: 200 },
  { name: "hotel detail", method: "get", path: routes.hotels.byId(hotelId), status: 404 },
  {
    name: "hotel detail invalid id",
    method: "get",
    path: routes.hotels.byId("not-an-id"),
    status: 400,
  },
  {
    name: "set hotel active",
    method: "patch",
    path: routes.hotels.adminById(hotelId),
    status: 401,
  },
  { name: "list bookings", method: "get", path: routes.bookings.list, status: 401 },
  { name: "my bookings", method: "get", path: routes.bookings.myBookings, status: 401 },
  {
    name: "payment intent",
    method: "post",
    path: routes.bookings.paymentIntent,
    status: 401,
  },
  { name: "create booking", method: "post", path: routes.bookings.create, status: 401 },
  {
    name: "bookings for hotel",
    method: "get",
    path: routes.bookings.forHotel(hotelId),
    status: 401,
  },
  { name: "booking detail", method: "get", path: routes.bookings.byId(id), status: 401 },
  { name: "cancel booking", method: "post", path: routes.bookings.cancel(id), status: 401 },
  {
    name: "admin cancel booking",
    method: "post",
    path: routes.bookings.adminCancel(id),
    status: 401,
  },
  { name: "admin booking detail", method: "get", path: routes.bookings.adminById(id), status: 401 },

  { name: "list reviews", method: "get", path: routes.reviews.list, status: 401 },
  { name: "hotel reviews", method: "get", path: routes.reviews.byHotel(hotelId), status: 200 },
  {
    name: "hotel review summary",
    method: "get",
    path: routes.reviews.summary(hotelId),
    status: 200,
  },
  { name: "create review", method: "post", path: routes.reviews.create(id), status: 401 },

  { name: "insights dashboard", method: "get", path: routes.insights.dashboard, status: 401 },
  { name: "insights forecast", method: "get", path: routes.insights.forecast, status: 401 },
  { name: "insights system stats", method: "get", path: routes.insights.systemStats, status: 401 },
  { name: "list rollups", method: "get", path: routes.insights.rollups, status: 401 },
  { name: "create rollup", method: "post", path: routes.insights.rollups, status: 401 },

  { name: "ai suggestions", method: "post", path: routes.ai.suggest, status: 401 },
  { name: "partner capabilities", method: "get", path: routes.partner.capabilities, status: 200 },

  { name: "list my hotels", method: "get", path: routes.myHotels.list, status: 401 },
  { name: "create my hotel", method: "post", path: routes.myHotels.list, status: 401 },
  { name: "my hotel detail", method: "get", path: routes.myHotels.byId(hotelId), status: 401 },
  {
    name: "set my hotel active",
    method: "patch",
    path: routes.myHotels.active(hotelId),
    status: 401,
  },
  { name: "update my hotel", method: "patch", path: routes.myHotels.byId(hotelId), status: 401 },
  {
    name: "add my hotel images",
    method: "post",
    path: routes.myHotels.images(hotelId),
    status: 401,
  },
  {
    name: "remove my hotel image",
    method: "delete",
    path: routes.myHotels.images(hotelId),
    status: 401,
  },
  { name: "my hotel stats", method: "get", path: routes.myHotels.stats(hotelId), status: 401 },
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
