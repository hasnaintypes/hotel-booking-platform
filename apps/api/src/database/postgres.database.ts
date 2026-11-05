import { Injectable, type OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createDb, type Database, type DatabaseHandle } from "@hotel-booking/db";

export const DATABASE = Symbol("DATABASE");

@Injectable()
export class PostgresDatabase implements OnApplicationShutdown {
  readonly db: Database;
  private readonly handle: DatabaseHandle;

  constructor(config: ConfigService) {
    this.handle = createDb({
      connectionString: config.get<string>("database.url")!,
      maxConnections: config.get<number>("database.maxConnections"),
      statementTimeoutMs: config.get<number>("database.statementTimeoutMs"),
      idleInTransactionTimeoutMs: config.get<number>("database.idleInTransactionTimeoutMs"),
      lockTimeoutMs: config.get<number>("database.lockTimeoutMs"),
    });
    this.db = this.handle.db;
  }

  async ping(): Promise<void> {
    await this.handle.pool.query("select 1");
  }

  async onApplicationShutdown(): Promise<void> {
    await this.handle.close();
  }
}
