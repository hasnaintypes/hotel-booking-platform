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

describe.skipIf(!url)("migration 0005 bookings and payments", () => {
  it("preserves legacy bookings while adding owner, money and ledger tables", async () => {
    const adminUrl = new URL(url!);
    adminUrl.pathname = "/postgres";

    const admin = new Client({ connectionString: adminUrl.toString() });
    await admin.connect();

    const name = databaseName("migration_bookings");
    await admin.query(`create database "${name}"`);

    try {
      const targetUrl = new URL(url!);
      targetUrl.pathname = `/${name}`;
      const client = new Client({ connectionString: targetUrl.toString() });
      await client.connect();

      try {
        const before = migrationFiles.filter((file) => Number(file.slice(0, 4)) < 5);
        const target = migrationFiles.find((file) => file.startsWith("0005_"));
        expect(target).toBeDefined();

        for (const file of before) await applyMigration(client, file);

        const user = await client.query<{ id: string }>(
          "insert into users (email) values ('legacy-booking@example.test') returning id",
        );
        const userId = user.rows[0]!.id;
        const hotel = await client.query<{ id: string }>(
          `insert into hotels
            (owner_user_id, created_by_user_id, name, description, city, country, country_code,
             star_rating, price_per_night_minor)
           values ($1, $1, 'Legacy Hotel', 'Existing owner', 'Bristol', 'United Kingdom', 'GB', 4,
             12500)
           returning id`,
          [userId],
        );
        const hotelId = hotel.rows[0]!.id;
        const booking = await client.query<{ id: string }>(
          `insert into bookings (user_id, hotel_id, created_by_user_id, check_in, check_out)
           values ($1, $2, $1, '2026-12-01', '2026-12-03')
           returning id`,
          [userId, hotelId],
        );
        const bookingId = booking.rows[0]!.id;

        await applyMigration(client, target!);

        const migrated = await client.query<{
          owner_user_id: string;
          created_by_user_id: string;
          public_reference: string;
          currency_code: string;
          total_amount_minor: number;
          status: string;
          inventory_source: string;
        }>(
          `select owner_user_id, created_by_user_id, public_reference, currency_code,
             total_amount_minor, status, inventory_source
           from bookings
           where id = $1`,
          [bookingId],
        );

        expect(migrated.rows[0]).toMatchObject({
          owner_user_id: userId,
          created_by_user_id: userId,
          currency_code: "GBP",
          total_amount_minor: 0,
          status: "pending",
          inventory_source: "managed",
        });
        expect(migrated.rows[0]!.public_reference).toMatch(/^[a-z0-9]{32}$/);

        const tables = await client.query<{ table_name: string }>(
          `select table_name
             from information_schema.tables
            where table_schema = 'public'
              and table_name in ('payments', 'ledger_entries', 'booking_events')
            order by table_name`,
        );
        expect(tables.rows.map((row) => row.table_name)).toEqual([
          "booking_events",
          "ledger_entries",
          "payments",
        ]);
      } finally {
        await client.end();
      }
    } finally {
      await admin.query(`drop database if exists "${name}" with (force)`);
      await admin.end();
    }
  });
});
