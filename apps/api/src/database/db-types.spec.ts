import { describe, expect, expectTypeOf, it } from "vitest";
import type { Database } from "@hotel-booking/db";

describe("@hotel-booking/db", () => {
  it("exposes the typed database handle to other workspaces", () => {
    expect(true).toBe(true);
    expectTypeOf<Database>().toHaveProperty("select");
    expectTypeOf<Database>().toHaveProperty("transaction");
  });
});
