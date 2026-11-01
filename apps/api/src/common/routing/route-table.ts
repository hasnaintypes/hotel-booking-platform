import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { CONTROLLERS } from "./controllers";

export type RouteEntry = {
  method: string;
  segments: string[];
};

const segmentsOf = (path: string) => path.split("/").filter(Boolean);
const isParam = (segment: string) => segment.startsWith(":");

function collectRoutes(): RouteEntry[] {
  const routes: RouteEntry[] = [];
  for (const controller of CONTROLLERS) {
    const base = (Reflect.getMetadata(PATH_METADATA, controller) as string | undefined) ?? "";
    for (const name of Object.getOwnPropertyNames(controller.prototype)) {
      const handler = controller.prototype[name];
      if (typeof handler !== "function" || name === "constructor") continue;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      if (method === undefined) continue;
      const own = (Reflect.getMetadata(PATH_METADATA, handler) as string | undefined) ?? "";
      routes.push({
        method: RequestMethod[method],
        segments: [...segmentsOf(base), ...segmentsOf(own)],
      });
    }
  }
  return routes;
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
