import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hotels, type Database } from "@hotel-booking/db";
import { DATABASE } from "../src/database/postgres.database";
import { HotelsRepository } from "../src/database/repositories/hotels.repository";
import { createTestApp, type TestApp } from "./support/create-app";
import { registerUser } from "./support/helpers";

const TOTAL = 10_000;
const CHUNK = 1_000;

describe("hotel search at scale", () => {
  let t: TestApp;
  let repo: HotelsRepository;

  beforeAll(async () => {
    t = await createTestApp();
    const owner = await registerUser(t);
    const db = t.app.get<Database>(DATABASE);

    for (let start = 0; start < TOTAL; start += CHUNK) {
      const rows = Array.from({ length: CHUNK }, (_, offset) => {
        const index = start + offset;
        const destination =
          index % CHUNK === 0 ? `Zanzibar ${index}` : `Town ${index.toString().padStart(5, "0")}`;
        return {
          source: "managed" as const,
          ownerUserId: owner.user._id,
          createdByUserId: owner.user._id,
          name: `Hotel ${index}`,
          description: "A seeded hotel for the search performance test.",
          city: destination,
          country: "United Kingdom",
          countryCode: "GB",
          starRating: (index % 5) + 1,
          pricePerNightMinor: 5_000 + (index % 200) * 100,
          currencyCode: "GBP",
          status: "active" as const,
        };
      });
      await db.insert(hotels).values(rows);
    }

    await db.execute(sql`vacuum (analyze) "hotels"`);
    repo = t.app.get(HotelsRepository);
  }, 120_000);

  afterAll(async () => {
    await t.close();
  });

  it("uses trigram indexes for the destination predicate", async () => {
    const db = t.app.get<Database>(DATABASE);
    const result = await db.execute(sql`
      explain (format json)
      select "id" from "hotels"
      where lower("city") like ${"%zanzibar%"} escape '\\'
        or lower("country") like ${"%zanzibar%"} escape '\\'
      order by "updated_at" desc, "id" asc
      limit 5
    `);

    const plan = JSON.stringify((result as unknown as { rows: unknown[] }).rows ?? result);
    expect(plan).toMatch(/hotels_(city|country)_trgm_idx/);
  });

  it("returns one page from 10k hotels without loading the table", async () => {
    const started = Date.now();
    const result = await repo.search({ destination: "Zanzibar" });
    const elapsed = Date.now() - started;

    expect(result.data).toHaveLength(5);
    expect(result.pagination).toEqual({ total: 10, page: 1, pages: 2 });
    expect(elapsed).toBeLessThan(2000);
  });
});
