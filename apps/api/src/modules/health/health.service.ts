import { Injectable } from "@nestjs/common";
import type { SystemHealth } from "@hotel-booking/contracts";
import { PostgresDatabase } from "../../database/postgres.database";
import { MigrationsRepository } from "../../database/repositories/migrations.repository";

type PostgresStatus = "connected" | "disconnected";
type MigrationStatus = "ready" | "pending" | "unknown";

export type Readiness = {
  ready: boolean;
  checks: {
    postgres: PostgresStatus;
    migrations: MigrationStatus;
  };
};

@Injectable()
export class HealthService {
  constructor(
    private readonly postgres: PostgresDatabase,
    private readonly migrationsRepository: MigrationsRepository,
  ) {}

  async readiness(): Promise<Readiness> {
    let postgres: PostgresStatus;
    let migrations: MigrationStatus;

    try {
      await this.postgres.ping();
      postgres = "connected";
    } catch {
      postgres = "disconnected";
    }

    try {
      migrations = await this.migrationsRepository.status();
    } catch {
      migrations = "unknown";
    }

    return {
      ready: postgres === "connected" && migrations === "ready",
      checks: { postgres, migrations },
    };
  }

  async details(): Promise<SystemHealth> {
    const readiness = await this.readiness();
    const memUsage = process.memoryUsage();
    const heapUsedMb = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMb = Math.round(memUsage.heapTotal / 1024 / 1024);

    return {
      status: readiness.ready ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      performance: {
        memory: {
          usedMb: heapUsedMb,
          totalMb: heapTotalMb,
          percentage: heapTotalMb > 0 ? Math.round((heapUsedMb / heapTotalMb) * 100) : 0,
        },
        uptime: Math.round(process.uptime()),
      },
      checks: readiness.checks,
    };
  }
}
