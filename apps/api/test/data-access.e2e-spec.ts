import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@hotel-booking/db";
import { DATABASE } from "../src/database/postgres.database";
import { createTestApp, type TestApp } from "./support/create-app";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("PostgreSQL data access", () => {
  let context: TestApp;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    context = await createTestApp();
  });

  afterAll(async () => {
    await context.close();
  });

  it("provides a queryable Drizzle handle through the DATABASE token", async () => {
    const database = context.app.get<Database>(DATABASE);
    const result = await database.execute(sql`select 1 as ok`);

    expect(Number(result.rows[0]?.ok)).toBe(1);
  });
});
