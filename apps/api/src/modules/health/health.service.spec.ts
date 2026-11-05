import type { Connection } from "mongoose";
import { describe, expect, it, vi } from "vitest";
import type { PostgresDatabase } from "../../database/postgres.database";
import type { MigrationsRepository } from "../../database/repositories/migrations.repository";
import { HealthService } from "./health.service";

const service = (input: {
  mongoReadyState?: number;
  ping?: () => Promise<void>;
  migrations?: () => Promise<"ready" | "pending">;
}) =>
  new HealthService(
    { readyState: input.mongoReadyState ?? 1 } as Connection,
    { ping: input.ping ?? vi.fn(async () => {}) } as unknown as PostgresDatabase,
    {
      status: input.migrations ?? vi.fn(async () => "ready"),
    } as unknown as MigrationsRepository,
  );

describe("HealthService readiness", () => {
  it("is ready when both databases answer and migrations are applied", async () => {
    await expect(service({}).readiness()).resolves.toEqual({
      ready: true,
      checks: { database: "connected", postgres: "connected", migrations: "ready" },
    });
  });

  it("is not ready when migrations are pending", async () => {
    await expect(service({ migrations: async () => "pending" }).readiness()).resolves.toEqual({
      ready: false,
      checks: { database: "connected", postgres: "connected", migrations: "pending" },
    });
  });

  it("is not ready when PostgreSQL does not answer", async () => {
    await expect(
      service({
        ping: async () => {
          throw new Error("connection refused");
        },
      }).readiness(),
    ).resolves.toMatchObject({
      ready: false,
      checks: { postgres: "disconnected" },
    });
  });

  it("is not ready when the runtime database is disconnected", async () => {
    await expect(service({ mongoReadyState: 0 }).readiness()).resolves.toMatchObject({
      ready: false,
      checks: { database: "disconnected" },
    });
  });
});
