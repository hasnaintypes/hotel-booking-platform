import { describe, expect, it } from "vitest";
import {
  assertSeedPassword,
  assertSeedTarget,
  MIN_SEED_PASSWORD_LENGTH,
} from "../src/seed/guard.js";

const remote = "postgres://user:pass@db.example.com:5432/hotel_booking";

describe("assertSeedTarget", () => {
  it("allows a local database without extra flags", () => {
    expect(
      assertSeedTarget({ connectionString: "postgres://u:p@localhost:5432/hotel_booking" }),
    ).toEqual({ hostname: "localhost", databaseName: "hotel_booking" });
    expect(
      assertSeedTarget({ connectionString: "postgres://u:p@127.0.0.1:5432/hotel_booking" }),
    ).toEqual({ hostname: "127.0.0.1", databaseName: "hotel_booking" });
  });

  it("refuses a non-local database without ALLOW_SEED", () => {
    expect(() => assertSeedTarget({ connectionString: remote })).toThrow(/Refusing to seed/);
    expect(() => assertSeedTarget({ connectionString: remote })).toThrow(/ALLOW_SEED=true/);
  });

  it("refuses ALLOW_SEED without an explicit database name", () => {
    expect(() => assertSeedTarget({ connectionString: remote, allowSeed: "true" })).toThrow(
      /SEED_DATABASE_NAME/,
    );
  });

  it("refuses a mismatched database name", () => {
    expect(() =>
      assertSeedTarget({
        connectionString: remote,
        allowSeed: "true",
        seedDatabaseName: "some_other_database",
      }),
    ).toThrow(/does not match|target database is/);
  });

  it("allows a non-local target only with the flag and exact database name", () => {
    expect(
      assertSeedTarget({
        connectionString: remote,
        allowSeed: "TRUE",
        seedDatabaseName: "hotel_booking",
      }),
    ).toEqual({ hostname: "db.example.com", databaseName: "hotel_booking" });
  });

  it("rejects an invalid URL or a missing database name", () => {
    expect(() => assertSeedTarget({ connectionString: "not-a-url" })).toThrow(/valid PostgreSQL/);
    expect(() => assertSeedTarget({ connectionString: "postgres://u:p@localhost:5432" })).toThrow(
      /explicit database name/,
    );
  });
});

describe("assertSeedPassword", () => {
  it("requires an explicitly supplied password", () => {
    expect(() => assertSeedPassword(undefined)).toThrow(/SEED_PASSWORD/);
    expect(() => assertSeedPassword("")).toThrow(/SEED_PASSWORD/);
  });

  it("rejects the old weak demo password and any short value", () => {
    expect(() => assertSeedPassword("12345678")).toThrow(
      new RegExp(String(MIN_SEED_PASSWORD_LENGTH)),
    );
  });

  it("accepts a sufficiently long password and returns it", () => {
    expect(assertSeedPassword("correct-horse-battery-staple")).toBe("correct-horse-battery-staple");
  });
});
