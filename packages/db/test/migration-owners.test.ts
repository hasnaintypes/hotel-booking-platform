import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const migrationsDir = fileURLToPath(new URL("../migrations/", import.meta.url));

const migrationFiles = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort();

const applyMigration = async (client: Client, file: string) => {
  const sql = readFileSync(`${migrationsDir}${file}`, "utf8");
  for (const statement of sql.split("--> statement-breakpoint")) {
    if (statement.trim()) await client.query(statement);
  }
};

const databaseName = (prefix: string) =>
  `${prefix}_${randomUUID().replaceAll("-", "")}`.slice(0, 60);

describe.skipIf(!url)("migration 0003 existing-owner migration", () => {
  it("backfills creators for legacy hotels and bookings and seeds roles", async () => {
    const adminUrl = new URL(url!);
    adminUrl.pathname = "/postgres";

    const admin = new Client({ connectionString: adminUrl.toString() });
    await admin.connect();

    const name = databaseName("migration_owners");
    await admin.query(`create database "${name}"`);

    try {
      const targetUrl = new URL(url!);
      targetUrl.pathname = `/${name}`;
      const client = new Client({ connectionString: targetUrl.toString() });
      await client.connect();

      try {
        const before = migrationFiles.filter((file) => Number(file.slice(0, 4)) < 3);
        const target = migrationFiles.find((file) => file.startsWith("0003_"));
        expect(target).toBeDefined();

        for (const file of before) await applyMigration(client, file);

        const user = await client.query<{ id: string }>(
          "insert into users (email) values ('legacy-owner@example.test') returning id",
        );
        const userId = user.rows[0]!.id;
        const hotel = await client.query<{ id: string }>(
          `insert into hotels
            (owner_user_id, name, description, city, country, country_code, star_rating,
             price_per_night_minor)
           values ($1, 'Legacy Hotel', 'Existing owner', 'Bristol', 'United Kingdom', 'GB', 4,
             12500)
           returning id`,
          [userId],
        );
        const hotelId = hotel.rows[0]!.id;
        const booking = await client.query<{ id: string }>(
          `insert into bookings (user_id, hotel_id, check_in, check_out)
           values ($1, $2, '2026-12-01', '2026-12-03')
           returning id`,
          [userId, hotelId],
        );
        const bookingId = booking.rows[0]!.id;

        await applyMigration(client, target!);

        const migratedHotel = await client.query<{
          owner_user_id: string;
          created_by_user_id: string;
          organisation_id: string | null;
        }>("select owner_user_id, created_by_user_id, organisation_id from hotels where id = $1", [
          hotelId,
        ]);
        expect(migratedHotel.rows[0]).toEqual({
          owner_user_id: userId,
          created_by_user_id: userId,
          organisation_id: null,
        });

        const migratedBooking = await client.query<{
          user_id: string;
          created_by_user_id: string;
        }>("select user_id, created_by_user_id from bookings where id = $1", [bookingId]);
        expect(migratedBooking.rows[0]).toEqual({
          user_id: userId,
          created_by_user_id: userId,
        });

        const roles = await client.query<{ role_key: string }>(
          "select role_key from organisation_roles order by role_key",
        );
        expect(roles.rows.map((row) => row.role_key)).toEqual([
          "manager",
          "member",
          "owner",
          "viewer",
        ]);

        const permissionCount = await client.query<{ count: string }>(
          "select count(*)::text as count from role_permissions",
        );
        expect(permissionCount.rows[0]!.count).toBe("27");

        const ownerGrantCount = await client.query<{ count: string }>(
          "select count(*)::text as count from role_permissions where role_key = 'owner'",
        );
        expect(ownerGrantCount.rows[0]!.count).toBe("11");

        const legacyOwnerStillValid = await client.query<{ id: string }>(
          "select id from hotels where id = $1 and owner_user_id = $2",
          [hotelId, userId],
        );
        expect(legacyOwnerStillValid.rows).toHaveLength(1);
      } finally {
        await client.end();
      }
    } finally {
      await admin.query(`drop database if exists "${name}" with (force)`);
      await admin.end();
    }
  });
});
