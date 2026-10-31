import "reflect-metadata";
import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";
import { AiController } from "../../modules/ai/ai.controller";
import { AnalyticsController } from "../../modules/analytics/analytics.controller";
import { AuthController } from "../../modules/auth/auth.controller";
import { BookingsController } from "../../modules/bookings/bookings.controller";
import { MyBookingsController } from "../../modules/bookings/my-bookings.controller";
import { BusinessInsightsController } from "../../modules/business-insights/business-insights.controller";
import { HealthController } from "../../modules/health/health.controller";
import { HotelsController } from "../../modules/hotels/hotels.controller";
import { MyHotelsController } from "../../modules/my-hotels/my-hotels.controller";
import { ReviewsController } from "../../modules/reviews/reviews.controller";
import { UsersController } from "../../modules/users/users.controller";

/**
 * Two routes with the same HTTP method overlap when a request could match both, for example
 * `GET /hotels/search` and `GET /hotels/:id`. Which one answers then depends on declaration
 * order, which ADR-022 forbids for new routes.
 *
 * KNOWN_ORDER_DEPENDENT lists the overlaps that exist today. They are tolerated only while the
 * more specific route is declared first, and the list must shrink to nothing once the routes move
 * to the versioned route map.
 */
const KNOWN_ORDER_DEPENDENT: Array<[string, string]> = [
  ["GET /api/hotels/search", "GET /api/hotels/:id"],
];

const CONTROLLERS = [
  AiController,
  AnalyticsController,
  AuthController,
  BookingsController,
  MyBookingsController,
  BusinessInsightsController,
  HealthController,
  HotelsController,
  MyHotelsController,
  ReviewsController,
  UsersController,
];

interface RouteInfo {
  key: string;
  method: string;
  segments: string[];
  order: number;
}

const segmentsOf = (path: string) => path.split("/").filter(Boolean);
const isParam = (segment: string) => segment.startsWith(":");
const literalCount = (segments: string[]) => segments.filter((s) => !isParam(s)).length;

function collectRoutes(): RouteInfo[] {
  const routes: RouteInfo[] = [];
  let order = 0;
  for (const controller of CONTROLLERS) {
    const base = (Reflect.getMetadata(PATH_METADATA, controller) as string | undefined) ?? "";
    for (const name of Object.getOwnPropertyNames(controller.prototype)) {
      const handler = controller.prototype[name];
      if (typeof handler !== "function" || name === "constructor") continue;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      if (method === undefined) continue;
      const own = (Reflect.getMetadata(PATH_METADATA, handler) as string | undefined) ?? "";
      const segments = [...segmentsOf(base), ...segmentsOf(own)];
      const verb = RequestMethod[method];
      routes.push({
        key: `${verb} /${segments.join("/")}`,
        method: verb,
        segments,
        order: order++,
      });
    }
  }
  return routes;
}

function overlaps(a: RouteInfo, b: RouteInfo): boolean {
  if (a.method !== b.method || a.segments.length !== b.segments.length) return false;
  return a.segments.every((seg, i) => {
    const other = b.segments[i];
    return seg === other || isParam(seg) || isParam(other);
  });
}

function overlappingPairs(routes: RouteInfo[]): Array<[RouteInfo, RouteInfo]> {
  const pairs: Array<[RouteInfo, RouteInfo]> = [];
  for (let i = 0; i < routes.length; i++) {
    for (let j = i + 1; j < routes.length; j++) {
      if (overlaps(routes[i], routes[j])) pairs.push([routes[i], routes[j]]);
    }
  }
  return pairs;
}

const pairKey = (a: string, b: string) => [a, b].sort().join(" <-> ");
const known = new Set(KNOWN_ORDER_DEPENDENT.map(([a, b]) => pairKey(a, b)));

describe("route shadowing", () => {
  const routes = collectRoutes();
  const pairs = overlappingPairs(routes);

  it("finds the application's routes (guards against empty metadata)", () => {
    expect(routes.length).toBeGreaterThanOrEqual(40);
  });

  it("has no overlapping routes beyond the known, order-dependent ones", () => {
    const unexpected = pairs
      .filter(([a, b]) => !known.has(pairKey(a.key, b.key)))
      .map(([a, b]) => `${a.key}  overlaps  ${b.key}`);
    expect(unexpected).toEqual([]);
  });

  it("keeps each known overlap ordered with the more specific route first", () => {
    for (const [a, b] of pairs.filter(([x, y]) => known.has(pairKey(x.key, y.key)))) {
      const [first, second] = a.order < b.order ? [a, b] : [b, a];
      expect(
        literalCount(first.segments),
        `${first.key} must be declared before ${second.key}`,
      ).toBeGreaterThan(literalCount(second.segments));
    }
  });

  it("does not list overlaps that no longer exist", () => {
    const current = new Set(pairs.map(([a, b]) => pairKey(a.key, b.key)));
    const stale = [...known].filter((entry) => !current.has(entry));
    expect(stale).toEqual([]);
  });
});
