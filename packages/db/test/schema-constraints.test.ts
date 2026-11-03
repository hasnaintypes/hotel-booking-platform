import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const packageRoot = fileURLToPath(new URL("..", import.meta.url));

const uniqueEmail = () => `schema-${randomUUID()}@example.test`;

describe.skipIf(!url)("schema constraints on PostgreSQL", () => {
  let client: Client;

  beforeAll(async () => {
    execFileSync("pnpm", ["db:migrate"], {
      cwd: packageRoot,
      env: { ...process.env, DATABASE_URL: url },
      stdio: "pipe",
    });
    client = new Client({ connectionString: url });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  beforeEach(async () => {
    await client.query("begin");
  });

  afterEach(async () => {
    await client.query("rollback");
  });

  /**
   * Runs a statement expected to fail without poisoning the surrounding transaction: a failed
   * PostgreSQL statement aborts the transaction until it is rolled back to a savepoint.
   */
  const expectDatabaseError = async (run: () => Promise<unknown>, code: string) => {
    await client.query("savepoint expected_violation");
    let error: unknown;
    try {
      await run();
    } catch (caught) {
      error = caught;
    }
    await client.query("rollback to savepoint expected_violation");
    expect(error).toMatchObject({ code });
  };

  const insertUser = async (email = uniqueEmail()) => {
    const result = await client.query<{ id: string }>(
      "insert into users (email) values ($1) returning id",
      [email],
    );
    return result.rows[0]!.id;
  };

  const insertHotel = async (ownerUserId: string) => {
    const result = await client.query<{ id: string }>(
      `insert into hotels
        (owner_user_id, name, description, city, country, country_code, star_rating,
         price_per_night_minor)
       values ($1, 'Harbour Hotel', 'A test hotel', 'Bristol', 'United Kingdom', 'GB', 4, 12500)
       returning id`,
      [ownerUserId],
    );
    return result.rows[0]!.id;
  };

  const insertBooking = async (userId: string, hotelId: string) => {
    const result = await client.query<{ id: string }>(
      `insert into bookings (user_id, hotel_id, check_in, check_out)
       values ($1, $2, '2026-12-01', '2026-12-03')
       returning id`,
      [userId, hotelId],
    );
    return result.rows[0]!.id;
  };

  const insertReview = async (bookingId: string, userId: string, hotelId: string, rating = 5) =>
    client.query(
      `insert into reviews
        (booking_id, user_id, hotel_id, rating, comment, cleanliness, service, location, value,
         amenities)
       values ($1, $2, $3, $4, 'Lovely stay', 5, 5, 5, 5, 5)`,
      [bookingId, userId, hotelId, rating],
    );

  it("rejects a case-insensitive duplicate email", async () => {
    await insertUser("Grace@Example.test");

    await expectDatabaseError(() => insertUser("grace@example.test"), "23505");
  });

  it("rejects a duplicate review for the same booking and user", async () => {
    const userId = await insertUser();
    const hotelId = await insertHotel(userId);
    const bookingId = await insertBooking(userId, hotelId);

    await insertReview(bookingId, userId, hotelId);

    await expectDatabaseError(() => insertReview(bookingId, userId, hotelId), "23505");
  });

  it("rejects a review pointing at a missing user, hotel or booking", async () => {
    const userId = await insertUser();
    const hotelId = await insertHotel(userId);
    const bookingId = await insertBooking(userId, hotelId);

    await expectDatabaseError(() => insertReview(bookingId, randomUUID(), hotelId), "23503");
    await expectDatabaseError(() => insertReview(bookingId, userId, randomUUID()), "23503");
    await expectDatabaseError(() => insertReview(randomUUID(), userId, hotelId), "23503");
  });

  it("rejects ratings and category scores outside 1..5", async () => {
    const userId = await insertUser();
    const hotelId = await insertHotel(userId);
    const bookingId = await insertBooking(userId, hotelId);

    await expectDatabaseError(() => insertReview(bookingId, userId, hotelId, 6), "23514");
  });

  it("rejects a stay whose check-out is not after check-in", async () => {
    const userId = await insertUser();
    const hotelId = await insertHotel(userId);

    await expectDatabaseError(
      () =>
        client.query(
          `insert into bookings (user_id, hotel_id, check_in, check_out)
           values ($1, $2, '2026-12-03', '2026-12-01')`,
          [userId, hotelId],
        ),
      "23514",
    );
  });

  it("rejects a hotel with an out-of-range star rating or non-ISO country code", async () => {
    const userId = await insertUser();

    await expectDatabaseError(
      () =>
        client.query(
          `insert into hotels
            (owner_user_id, name, description, city, country, country_code, star_rating,
             price_per_night_minor)
           values ($1, 'Bad Stars', 'Test', 'Bristol', 'United Kingdom', 'GB', 6, 1000)`,
          [userId],
        ),
      "23514",
    );

    await expectDatabaseError(
      () =>
        client.query(
          `insert into hotels
            (owner_user_id, name, description, city, country, country_code, star_rating,
             price_per_night_minor)
           values ($1, 'Bad Country', 'Test', 'Bristol', 'United Kingdom', 'gb', 4, 1000)`,
          [userId],
        ),
      "23514",
    );
  });

  it("rejects a managed hotel without an owner", async () => {
    await expectDatabaseError(
      () =>
        client.query(
          `insert into hotels
            (name, description, city, country, country_code, star_rating, price_per_night_minor)
           values ('Unowned', 'Test', 'Bristol', 'United Kingdom', 'GB', 4, 1000)`,
        ),
      "23514",
    );
  });

  it("rejects orphaned credentials and OAuth accounts", async () => {
    await expectDatabaseError(
      () =>
        client.query("insert into credentials (user_id, password_hash) values ($1, 'hash')", [
          randomUUID(),
        ]),
      "23503",
    );

    await expectDatabaseError(
      () =>
        client.query(
          `insert into oauth_accounts (user_id, provider, provider_account_id)
           values ($1, 'google', 'google-123')`,
          [randomUUID()],
        ),
      "23503",
    );
  });

  it("keeps referential actions explicit: bookings block hotel deletion", async () => {
    const userId = await insertUser();
    const hotelId = await insertHotel(userId);
    await insertBooking(userId, hotelId);

    await expectDatabaseError(
      () => client.query("delete from hotels where id = $1", [hotelId]),
      "23503",
    );
  });

  it("stores no mutable counter columns", async () => {
    const result = await client.query<{ column_name: string }>(
      `select column_name
         from information_schema.columns
        where table_schema = 'public'
          and column_name in
            ('total_bookings', 'total_revenue', 'total_spent', 'average_rating', 'review_count',
             'occupancy_rate')
        order by column_name`,
    );

    expect(result.rows.map((row) => row.column_name)).toEqual([]);
  });
});
