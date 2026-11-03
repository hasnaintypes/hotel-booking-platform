import { Inject, Injectable } from "@nestjs/common";
import { EXPECTED_MIGRATION_COUNT, type Database } from "@hotel-booking/db";
import { sql } from "drizzle-orm";
import { DATABASE } from "../postgres.database";

/** Reads Drizzle's migration journal without leaking SQL into domain modules. */
@Injectable()
export class MigrationsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  get expectedCount(): number {
    return EXPECTED_MIGRATION_COUNT;
  }

  async status(): Promise<"ready" | "pending"> {
    const result = await this.db.execute(
      sql`select count(*)::int as count from drizzle.__drizzle_migrations`,
    );
    const applied = Number(result.rows[0]?.count ?? 0);
    return applied >= this.expectedCount ? "ready" : "pending";
  }
}
