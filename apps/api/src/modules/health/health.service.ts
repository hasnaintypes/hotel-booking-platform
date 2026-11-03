import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { Connection } from "mongoose";
import { MigrationsRepository } from "../../database/repositories/migrations.repository";

type ComponentStatus = "connected" | "disconnected" | "ready" | "pending" | "unknown";

export type Readiness = {
  ready: boolean;
  checks: {
    database: ComponentStatus;
    migrations: ComponentStatus;
  };
};

@Injectable()
export class HealthService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly migrationsRepository: MigrationsRepository,
  ) {}

  private get mongoConnected() {
    return this.connection.readyState === 1;
  }

  async readiness(): Promise<Readiness> {
    const database: ComponentStatus = this.mongoConnected ? "connected" : "disconnected";
    let migrations: ComponentStatus;

    try {
      migrations = await this.migrationsRepository.status();
    } catch {
      migrations = "unknown";
    }

    return {
      ready: database === "connected" && migrations === "ready",
      checks: { database, migrations },
    };
  }

  async details() {
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
