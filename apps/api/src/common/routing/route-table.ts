import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { AUDIENCE_GROUPS } from "./controllers";

export type RouteEntry = {
  method: string;
  segments: string[];
};

/** Global prefix and version applied once in `configureApp`. */
const API_BASE = ["api", "v1"];
/** Routes mounted outside the `/api/v1` prefix (health and provider webhooks). */
const NON_API_ROUTES: RouteEntry[] = [
  { method: "GET", segments: ["health", "live"] },
  { method: "GET", segments: ["health", "ready"] },
  { method: "POST", segments: ["webhooks", "stripe"] },
];

const segmentsOf = (path: string) => path.split("/").filter(Boolean);
const isParam = (segment: string) => segment.startsWith(":");

function collectRoutes(): RouteEntry[] {
  const routes: RouteEntry[] = [];
  for (const group of AUDIENCE_GROUPS) {
    const groupSegments = segmentsOf(group.path);
    for (const controller of group.controllers) {
      const base = (Reflect.getMetadata(PATH_METADATA, controller) as string | undefined) ?? "";
      for (const name of Object.getOwnPropertyNames(controller.prototype)) {
        const handler = controller.prototype[name];
        if (typeof handler !== "function" || name === "constructor") continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
        if (method === undefined) continue;
        const own = (Reflect.getMetadata(PATH_METADATA, handler) as string | undefined) ?? "";
        routes.push({
          method: RequestMethod[method],
          segments: [...API_BASE, ...groupSegments, ...segmentsOf(base), ...segmentsOf(own)],
        });
      }
    }
  }
  return [...routes, ...NON_API_ROUTES];
}

export const ROUTE_TABLE = collectRoutes();

/**
 * Methods that have a route matching this concrete request path. Used to answer a known
 * path with 405 and an `Allow` header instead of a misleading 404.
 */
export function allowedMethodsFor(path: string): string[] {
  const segments = segmentsOf(path);
  const methods = new Set<string>();
  for (const route of ROUTE_TABLE) {
    if (route.segments.length !== segments.length) continue;
    const matches = route.segments.every(
      (segment, index) => segment === segments[index] || isParam(segment),
    );
    if (matches) methods.add(route.method);
  }
  return [...methods].sort();
}
