import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { OpenAPIObject } from "@nestjs/swagger";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ROUTE_TABLE } from "../src/common/routing/route-table";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { buildApiDocuments } from "../src/config/swagger.config";
import { ADR_STATUSES } from "./support/status-matrix";

/**
 * The committed OpenAPI snapshot is the contract's documentation half: a changed schema, path or
 * status code fails here until the snapshot is regenerated deliberately.
 *
 * Regenerate with `pnpm --filter @hotel-booking/api openapi:generate`.
 */
const snapshotDir = resolve(process.cwd(), "openapi");
const update = process.env.UPDATE_OPENAPI === "1";

/**
 * Removes environment-dependent values and sorts keys, so the same routes always serialise alike
 * regardless of machine, timezone or configured URLs.
 */
const normalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "servers")
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => [key, normalize(entry)]),
  );
};

const serialize = (document: OpenAPIObject): string =>
  `${JSON.stringify(normalize(document), null, 2)}\n`;

describe("OpenAPI snapshot", () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("matches the committed documents for every audience", async () => {
    const documents = buildApiDocuments(app);
    const files = {
      "combined.json": documents.combined,
      "public.json": documents.audiences.public,
      "manage.json": documents.audiences.manage,
      "admin.json": documents.audiences.admin,
      "partner.json": documents.audiences.partner,
    };

    if (update) await mkdir(snapshotDir, { recursive: true });

    for (const [name, document] of Object.entries(files)) {
      const expected = serialize(document);
      if (update) await writeFile(join(snapshotDir, name), expected, "utf8");
      const actual = await readFile(join(snapshotDir, name), "utf8");
      expect(actual, `${name} is out of date; run openapi:generate and commit the result`).toBe(
        expected,
      );
    }
  });

  it("documents the migrated hotel routes with request and response schemas", async () => {
    const { combined } = buildApiDocuments(app);

    const search = combined.paths?.["/api/v1/hotels/search"]?.get;
    expect(search).toBeDefined();
    expect(search?.responses?.["200"]).toBeDefined();

    const searchDocument = JSON.stringify(search);
    expect(searchDocument).toContain("#/components/schemas/PublicHotelPageDto_Output");
    expect(Object.keys(combined.components?.schemas ?? {})).toEqual(
      expect.arrayContaining(["PublicHotelPageDto_Output", "PublicHotelDto_Output"]),
    );

    const parameters = (search?.parameters ?? []).map((parameter) =>
      "name" in parameter ? parameter.name : undefined,
    );
    expect(parameters).toEqual(
      expect.arrayContaining([
        "limit",
        "cursor",
        "destination",
        "adultCount",
        "childCount",
        "facilities",
        "types",
        "stars",
        "maxPrice",
        "sortOption",
      ]),
    );
    expect(parameters).not.toContain("page");
  });

  it("documents the booking, review and user routes with response schemas", () => {
    const { combined } = buildApiDocuments(app);
    const schemaOf = (path: string, method: string, status: string) => {
      const operation = combined.paths?.[path]?.[method] as
        | {
            responses?: Record<
              string,
              { content?: Record<string, { schema?: { $ref?: string } }> }
            >;
          }
        | undefined;
      return operation?.responses?.[status]?.content?.["application/json"]?.schema?.$ref;
    };

    expect(schemaOf("/api/v1/bookings", "get", "200")).toContain("BookingPageDto_Output");
    expect(schemaOf("/api/v1/bookings", "post", "201")).toContain("BookingCreationDto_Output");
    expect(schemaOf("/api/v1/bookings/{id}", "get", "200")).toContain("BookingDto_Output");
    expect(schemaOf("/api/v1/bookings/{id}/cancel", "post", "200")).toContain(
      "CancelBookingResponseDto_Output",
    );
    expect(schemaOf("/api/v1/admin/bookings/{id}", "get", "200")).toContain(
      "BookingDetailDto_Output",
    );
    expect(schemaOf("/api/v1/bookings/{bookingId}/reviews", "post", "201")).toContain(
      "ReviewDto_Output",
    );
    expect(schemaOf("/api/v1/hotels/{hotelId}/reviews", "get", "200")).toContain(
      "ReviewPageDto_Output",
    );
    expect(schemaOf("/api/v1/hotels/{hotelId}/rating", "get", "200")).toContain(
      "ReviewSummaryDto_Output",
    );
    expect(schemaOf("/api/v1/admin/users", "get", "200")).toContain("AdminUserPageDto_Output");
    expect(schemaOf("/api/v1/me", "get", "200")).toContain("PublicUserDto_Output");

    expect(Object.keys(combined.components?.schemas ?? {})).toEqual(
      expect.arrayContaining([
        "BookingPageDto_Output",
        "BookingCreationDto_Output",
        "BookingDetailDto_Output",
        "CancelBookingResponseDto_Output",
        "ReviewPageDto_Output",
        "ReviewSummaryDto_Output",
        "AdminUserPageDto_Output",
        "PublicUserDto_Output",
      ]),
    );
  });

  it("documents the reconciliation queue with response schemas", () => {
    const { combined } = buildApiDocuments(app);
    const schemaOf = (path: string, method: string, status: string) => {
      const operation = combined.paths?.[path]?.[method] as
        | {
            responses?: Record<
              string,
              { content?: Record<string, { schema?: { $ref?: string } }> }
            >;
          }
        | undefined;
      return operation?.responses?.[status]?.content?.["application/json"]?.schema?.$ref;
    };

    const listPath = "/api/v1/admin/reconciliation/discrepancies";
    expect(schemaOf(listPath, "get", "200")).toContain("DiscrepancyPageDto_Output");
    expect(schemaOf(`${listPath}/{id}`, "patch", "200")).toContain("DiscrepancyDto_Output");

    expect(Object.keys(combined.components?.schemas ?? {})).toEqual(
      expect.arrayContaining(["DiscrepancyPageDto_Output", "DiscrepancyDto_Output"]),
    );
  });

  it("documents every routed endpoint with a response and only matrix statuses", () => {
    const { combined } = buildApiDocuments(app);
    const pathOf = (segments: string[]) =>
      `/${segments.map((segment) => (segment.startsWith(":") ? `{${segment.slice(1)}}` : segment)).join("/")}`;

    const paths = (combined.paths ?? {}) as Record<string, Record<string, unknown>>;
    const missing = ROUTE_TABLE.flatMap((route) => {
      const path = pathOf(route.segments);
      const operation = paths[path]?.[route.method.toLowerCase()] as
        { responses?: Record<string, unknown> } | undefined;
      if (!operation || Object.keys(operation.responses ?? {}).length === 0) {
        return [`${route.method} ${path}`];
      }
      return [];
    });
    expect(missing).toEqual([]);

    const outsideMatrix = Object.entries(paths).flatMap(([path, operations]) =>
      Object.entries(operations).flatMap(([method, operation]) =>
        Object.keys((operation as { responses?: Record<string, unknown> }).responses ?? {})
          .filter((status) => !ADR_STATUSES.has(Number(status)))
          .map((status) => `${method.toUpperCase()} ${path} ${status}`),
      ),
    );
    expect(outsideMatrix).toEqual([]);
  });
});
