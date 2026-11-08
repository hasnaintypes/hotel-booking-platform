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
        (owner_user_id, created_by_user_id, name, description, city, country, country_code,
         star_rating, price_per_night_minor)
       values ($1, $1, 'Harbour Hotel', 'A test hotel', 'Bristol', 'United Kingdom', 'GB', 4,
         12500)
       returning id`,
      [ownerUserId],
    );
    return result.rows[0]!.id;
  };

  const insertOrganisation = async (slug = `org-${randomUUID()}`) => {
    const result = await client.query<{ id: string }>(
      "insert into organisations (name, slug) values ('Test Agency', $1) returning id",
      [slug],
    );
    return result.rows[0]!.id;
  };

  const insertBooking = async (userId: string, hotelId: string, organisationId?: string) => {
    const result = await client.query<{ id: string }>(
      `insert into bookings (owner_user_id, hotel_id, organisation_id, created_by_user_id, check_in, check_out)
       values ($1, $2, $3, $1, '2026-12-01', '2026-12-03')
       returning id`,
      [userId, hotelId, organisationId ?? null],
    );
    return result.rows[0]!.id;
  };

  const insertPayment = async (
    bookingId: string,
    provider = "stripe",
    providerPaymentId = `pi_${randomUUID()}`,
    amountMinor = 1_000,
  ) => {
    const result = await client.query<{ id: string }>(
      `insert into payments
        (booking_id, provider, provider_payment_id, amount_minor, currency_code)
       values ($1, $2, $3, $4, 'GBP')
       returning id`,
      [bookingId, provider, providerPaymentId, amountMinor],
    );
    return result.rows[0]!.id;
  };

  const insertLedgerEntry = async (bookingId: string, amountMinor = 1_000) =>
    client.query(
      `insert into ledger_entries (booking_id, entry_type, amount_minor, currency_code)
       values ($1, 'charge', $2, 'GBP')`,
      [bookingId, amountMinor],
    );

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
          `insert into bookings (owner_user_id, hotel_id, created_by_user_id, check_in, check_out)
           values ($1, $2, $1, '2026-12-03', '2026-12-01')`,
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
            (owner_user_id, created_by_user_id, name, description, city, country, country_code,
             star_rating, price_per_night_minor)
           values ($1, $1, 'Bad Stars', 'Test', 'Bristol', 'United Kingdom', 'GB', 6, 1000)`,
          [userId],
        ),
      "23514",
    );

    await expectDatabaseError(
      () =>
        client.query(
          `insert into hotels
            (owner_user_id, created_by_user_id, name, description, city, country, country_code,
             star_rating, price_per_night_minor)
           values ($1, $1, 'Bad Country', 'Test', 'Bristol', 'United Kingdom', 'gb', 4, 1000)`,
          [userId],
        ),
      "23514",
    );
  });

  it("rejects a managed hotel without an owner", async () => {
    const userId = await insertUser();

    await expectDatabaseError(
      () =>
        client.query(
          `insert into hotels
            (created_by_user_id, name, description, city, country, country_code, star_rating,
             price_per_night_minor)
           values ($1, 'Unowned', 'Test', 'Bristol', 'United Kingdom', 'GB', 4, 1000)`,
          [userId],
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

  it("accepts organisation-owned hotels and bookings without a user owner", async () => {
    const userId = await insertUser();
    const organisationId = await insertOrganisation();
    const hotelResult = await client.query<{ id: string }>(
      `insert into hotels
        (organisation_id, created_by_user_id, name, description, city, country, country_code,
         star_rating, price_per_night_minor)
       values ($1, $2, 'Agency Hotel', 'A test hotel', 'Bristol', 'United Kingdom', 'GB', 4, 12500)
       returning id`,
      [organisationId, userId],
    );
    const hotelId = hotelResult.rows[0]!.id;

    const bookingId = await insertBooking(userId, hotelId, organisationId);
    const booking = await client.query<{ organisation_id: string; created_by_user_id: string }>(
      "select organisation_id, created_by_user_id from bookings where id = $1",
      [bookingId],
    );

    expect(booking.rows[0]).toEqual({
      organisation_id: organisationId,
      created_by_user_id: userId,
    });
  });

  it("requires a managed hotel to record who created it", async () => {
    const userId = await insertUser();

    await expectDatabaseError(
      () =>
        client.query(
          `insert into hotels
            (owner_user_id, name, description, city, country, country_code, star_rating,
             price_per_night_minor)
           values ($1, 'No Creator', 'Test', 'Bristol', 'United Kingdom', 'GB', 4, 1000)`,
          [userId],
        ),
      "23514",
    );
  });

  it("rejects duplicate organisation slugs and duplicate memberships", async () => {
    const userId = await insertUser();
    const organisationId = await insertOrganisation("duplicate-agency");

    await expectDatabaseError(() => insertOrganisation("duplicate-agency"), "23505");

    await client.query(
      "insert into memberships (user_id, organisation_id, role_key) values ($1, $2, 'owner')",
      [userId, organisationId],
    );
    await expectDatabaseError(
      () =>
        client.query(
          "insert into memberships (user_id, organisation_id, role_key) values ($1, $2, 'viewer')",
          [userId, organisationId],
        ),
      "23505",
    );
  });

  it("rejects unknown roles and permissions", async () => {
    const userId = await insertUser();
    const organisationId = await insertOrganisation();

    await expectDatabaseError(
      () =>
        client.query(
          "insert into memberships (user_id, organisation_id, role_key) values ($1, $2, 'ghost')",
          [userId, organisationId],
        ),
      "23503",
    );

    await expectDatabaseError(
      () =>
        client.query(
          "insert into role_permissions (role_key, permission) values ('owner', 'hotel:explode')",
        ),
      "23514",
    );
  });

  it("keeps organisation deletion blocked while owned hotels exist", async () => {
    const userId = await insertUser();
    const organisationId = await insertOrganisation();
    await client.query(
      `insert into hotels
        (organisation_id, created_by_user_id, name, description, city, country, country_code,
         star_rating, price_per_night_minor)
       values ($1, $2, 'Agency Hotel', 'A test hotel', 'Bristol', 'United Kingdom', 'GB', 4, 12500)`,
      [organisationId, userId],
    );

    await expectDatabaseError(
      () => client.query("delete from organisations where id = $1", [organisationId]),
      "23503",
    );
  });

  it("accepts GBP but rejects unknown and disabled hotel currencies", async () => {
    const userId = await insertUser();
    await insertHotel(userId);

    await expectDatabaseError(
      () =>
        client.query(
          `insert into hotels
            (owner_user_id, created_by_user_id, name, description, city, country, country_code,
             star_rating, price_per_night_minor, currency_code)
           values ($1, $1, 'Unknown Currency', 'Test', 'Bristol', 'United Kingdom', 'GB', 4,
             1000, 'ZZZ')`,
          [userId],
        ),
      "23503",
    );

    await expectDatabaseError(
      () =>
        client.query(
          `insert into hotels
            (owner_user_id, created_by_user_id, name, description, city, country, country_code,
             star_rating, price_per_night_minor, currency_code)
           values ($1, $1, 'Disabled Currency', 'Test', 'Bristol', 'United Kingdom', 'GB', 4,
             1000, 'USD')`,
          [userId],
        ),
      "23514",
    );
  });

  it("rejects invalid currency reference data", async () => {
    await expectDatabaseError(
      () =>
        client.query(
          "insert into currencies (code, name, minor_unit_exponent) values ('gbp', 'Lower', 2)",
        ),
      "23514",
    );

    await expectDatabaseError(
      () =>
        client.query(
          "insert into currencies (code, name, minor_unit_exponent) values ('ABC', 'Bad Exponent', 7)",
        ),
      "23514",
    );

    await expectDatabaseError(
      () =>
        client.query(
          "insert into currencies (code, name, minor_unit_exponent) values ('GBP', 'Duplicate', 2)",
        ),
      "23505",
    );
  });

  it("rejects malformed exchange-rate rows", async () => {
    const insert = (values: string) =>
      client.query(
        `insert into exchange_rates (base_code, quote_code, rate, source, observed_at, valid_from, valid_to)
         values (${values})`,
      );

    await expectDatabaseError(
      () =>
        insert("'GBP', 'GBP', 1.25, 'test', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', null"),
      "23514",
    );
    await expectDatabaseError(
      () => insert("'GBP', 'USD', 0, 'test', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', null"),
      "23514",
    );
    await expectDatabaseError(
      () =>
        insert(
          "'GBP', 'USD', 1.25, 'test', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z', '2026-01-02T00:00:00Z'",
        ),
      "23514",
    );
    await expectDatabaseError(
      () =>
        insert("'GBP', 'USD', 1.25, 'test', '2026-01-03T00:00:00Z', '2026-01-02T00:00:00Z', null"),
      "23514",
    );
    await expectDatabaseError(
      () =>
        insert("'ZZZ', 'USD', 1.25, 'test', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', null"),
      "23503",
    );
  });

  it("keeps fx rate snapshots immutable", async () => {
    const rate = await client.query<{ id: string }>(
      `insert into exchange_rates
        (base_code, quote_code, rate, source, observed_at, valid_from)
       values ('GBP', 'USD', 1.25, 'test', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
       returning id`,
    );
    const exchangeRateId = rate.rows[0]!.id;
    const snapshot = await client.query<{ id: string }>(
      `insert into fx_rate_snapshots
        (exchange_rate_id, base_code, quote_code, rate, source, observed_at, valid_from)
       values ($1, 'GBP', 'USD', 1.25, 'test', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
       returning id`,
      [exchangeRateId],
    );
    const snapshotId = snapshot.rows[0]!.id;

    await expectDatabaseError(
      () => client.query("update fx_rate_snapshots set rate = 1.5 where id = $1", [snapshotId]),
      "55000",
    );
    await expectDatabaseError(
      () => client.query("delete from fx_rate_snapshots where id = $1", [snapshotId]),
      "55000",
    );
  });

  it("rejects an fx rate snapshot pointing at a missing exchange rate", async () => {
    await expectDatabaseError(
      () =>
        client.query(
          `insert into fx_rate_snapshots
            (exchange_rate_id, base_code, quote_code, rate, source, observed_at, valid_from)
           values ($1, 'GBP', 'USD', 1.25, 'test', '2026-01-01T00:00:00Z',
             '2026-01-01T00:00:00Z')`,
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

  it("rejects a replayed provider payment id across bookings", async () => {
    const userId = await insertUser();
    const hotelId = await insertHotel(userId);
    const firstBooking = await insertBooking(userId, hotelId);
    const secondBooking = await insertBooking(userId, hotelId);

    await insertPayment(firstBooking, "stripe", "pi_replayed");

    await expectDatabaseError(() => insertPayment(secondBooking, "stripe", "pi_replayed"), "23505");
  });

  it("allows only one active primary payment per booking", async () => {
    const userId = await insertUser();
    const hotelId = await insertHotel(userId);
    const bookingId = await insertBooking(userId, hotelId);

    await insertPayment(bookingId, "stripe", "pi_primary");

    await expectDatabaseError(
      () => insertPayment(bookingId, "stripe", "pi_second_primary"),
      "23505",
    );
  });

  it("stores money as non-negative integer minor units with a currency", async () => {
    const moneyColumns = await client.query<{
      table_name: string;
      column_name: string;
      data_type: string;
    }>(
      `select table_name, column_name, data_type
         from information_schema.columns
        where table_schema = 'public'
          and table_name in ('bookings', 'payments', 'ledger_entries')
          and column_name in ('total_amount_minor', 'amount_minor', 'currency_code')
        order by table_name, column_name`,
    );

    expect(moneyColumns.rows).toEqual([
      { table_name: "bookings", column_name: "currency_code", data_type: "character" },
      { table_name: "bookings", column_name: "total_amount_minor", data_type: "integer" },
      { table_name: "ledger_entries", column_name: "amount_minor", data_type: "integer" },
      { table_name: "ledger_entries", column_name: "currency_code", data_type: "character" },
      { table_name: "payments", column_name: "amount_minor", data_type: "integer" },
      { table_name: "payments", column_name: "currency_code", data_type: "character" },
    ]);

    const userId = await insertUser();
    const hotelId = await insertHotel(userId);
    const bookingId = await insertBooking(userId, hotelId);

    await expectDatabaseError(
      () =>
        client.query(
          `insert into bookings (owner_user_id, hotel_id, created_by_user_id, check_in, check_out,
             total_amount_minor)
           values ($1, $2, $1, '2026-12-01', '2026-12-03', -1)`,
          [userId, hotelId],
        ),
      "23514",
    );
    await expectDatabaseError(() => insertPayment(bookingId, "stripe", "pi_negative", -1), "23514");
    await expectDatabaseError(() => insertLedgerEntry(bookingId, -1), "23514");
  });

  it("enforces booking idempotency per owner and organisation", async () => {
    const userId = await insertUser();
    const otherUserId = await insertUser();
    const hotelId = await insertHotel(userId);
    const organisationId = await insertOrganisation();

    const insertWithKey = (ownerUserId: string, key: string, org?: string) =>
      client.query(
        `insert into bookings
          (owner_user_id, hotel_id, organisation_id, created_by_user_id, check_in, check_out,
           idempotency_key)
         values ($1, $2, $3, $1, '2026-12-01', '2026-12-03', $4)`,
        [ownerUserId, hotelId, org ?? null, key],
      );

    await insertWithKey(userId, "idem-1");

    await expectDatabaseError(() => insertWithKey(userId, "idem-1"), "23505");
    await insertWithKey(otherUserId, "idem-1");
    await insertWithKey(userId, "idem-1", organisationId);
  });

  it("rejects inconsistent supplier inventory fields", async () => {
    const userId = await insertUser();
    const hotelId = await insertHotel(userId);

    await expectDatabaseError(
      () =>
        client.query(
          `insert into bookings
            (owner_user_id, hotel_id, created_by_user_id, check_in, check_out, inventory_source)
           values ($1, $2, $1, '2026-12-01', '2026-12-03', 'supplier')`,
          [userId, hotelId],
        ),
      "23514",
    );

    await expectDatabaseError(
      () =>
        client.query(
          `insert into bookings
            (owner_user_id, hotel_id, created_by_user_id, check_in, check_out, supplier_id,
             supplier_reference)
           values ($1, $2, $1, '2026-12-01', '2026-12-03', 'supplier-1', 'ref-1')`,
          [userId, hotelId],
        ),
      "23514",
    );
  });

  it("rejects disabled or unknown currencies on bookings, payments and ledger entries", async () => {
    const userId = await insertUser();
    const hotelId = await insertHotel(userId);
    const bookingId = await insertBooking(userId, hotelId);
    const paymentId = await insertPayment(bookingId);

    await expectDatabaseError(
      () =>
        client.query(
          `insert into bookings
            (owner_user_id, hotel_id, created_by_user_id, check_in, check_out, currency_code)
           values ($1, $2, $1, '2026-12-01', '2026-12-03', 'USD')`,
          [userId, hotelId],
        ),
      "23514",
    );
    await expectDatabaseError(
      () => client.query("update payments set currency_code = 'USD' where id = $1", [paymentId]),
      "23514",
    );
    await expectDatabaseError(
      () =>
        client.query(
          `insert into ledger_entries (booking_id, entry_type, amount_minor, currency_code)
           values ($1, 'charge', 1000, 'ZZZ')`,
          [bookingId],
        ),
      "23503",
    );
  });

  it("keeps ledger entries and booking events append-only", async () => {
    const userId = await insertUser();
    const hotelId = await insertHotel(userId);
    const bookingId = await insertBooking(userId, hotelId);

    await insertLedgerEntry(bookingId);
    const event = await client.query<{ id: string }>(
      `insert into booking_events (booking_id, to_status)
       values ($1, 'confirmed')
       returning id`,
      [bookingId],
    );
    const eventId = event.rows[0]!.id;

    await expectDatabaseError(
      () =>
        client.query("update ledger_entries set amount_minor = 2000 where booking_id = $1", [
          bookingId,
        ]),
      "55000",
    );
    await expectDatabaseError(
      () => client.query("delete from ledger_entries where booking_id = $1", [bookingId]),
      "55000",
    );
    await expectDatabaseError(() => client.query("truncate ledger_entries"), "55000");
    await expectDatabaseError(
      () => client.query("update booking_events set reason = 'rewritten' where id = $1", [eventId]),
      "55000",
    );
    await expectDatabaseError(
      () => client.query("delete from booking_events where id = $1", [eventId]),
      "55000",
    );
    await expectDatabaseError(() => client.query("truncate booking_events"), "55000");
  });

  it("rejects invalid booking event transitions and metadata", async () => {
    const userId = await insertUser();
    const hotelId = await insertHotel(userId);
    const bookingId = await insertBooking(userId, hotelId);

    await expectDatabaseError(
      () =>
        client.query(
          `insert into booking_events (booking_id, from_status, to_status)
           values ($1, 'confirmed', 'confirmed')`,
          [bookingId],
        ),
      "23514",
    );
    await expectDatabaseError(
      () =>
        client.query(
          `insert into booking_events (booking_id, to_status, metadata)
           values ($1, 'confirmed', '[]'::jsonb)`,
          [bookingId],
        ),
      "23514",
    );
  });

  it("enforces idempotency key uniqueness, status, hash and expiry", async () => {
    const hash = "a".repeat(64);
    const insertKey = (scope = "bookings.create:user-1", key = "key-1") =>
      client.query(
        `insert into idempotency_keys (scope, key, request_hash, expires_at)
         values ($1, $2, $3, now() + interval '48 hours')`,
        [scope, key, hash],
      );

    await insertKey();
    await expectDatabaseError(() => insertKey(), "23505");
    await insertKey("bookings.create:user-2", "key-1");

    await expectDatabaseError(
      () =>
        client.query(
          `insert into idempotency_keys (scope, key, request_hash, status, expires_at)
           values ('scope', 'key-2', $1, 'unknown', now() + interval '1 hour')`,
          [hash],
        ),
      "23514",
    );
    await expectDatabaseError(
      () =>
        client.query(
          `insert into idempotency_keys (scope, key, request_hash, expires_at)
           values ('scope', 'key-3', 'not-a-hash', now() + interval '1 hour')`,
        ),
      "23514",
    );
    await expectDatabaseError(
      () =>
        client.query(
          `insert into idempotency_keys (scope, key, request_hash, response, expires_at)
           values ('scope', 'key-4', $1, '[]'::jsonb, now() + interval '1 hour')`,
          [hash],
        ),
      "23514",
    );
    await expectDatabaseError(
      () =>
        client.query(
          `insert into idempotency_keys (scope, key, request_hash, created_at, expires_at)
           values ('scope', 'key-5', $1, now(), now())`,
          [hash],
        ),
      "23514",
    );
  });

  it("stores no mutable counter columns", async () => {
    const result = await client.query<{ column_name: string }>(
      `select column_name
         from information_schema.columns
        where table_schema = 'public'
          and table_name <> 'analytics_snapshots'
          and column_name in
            ('total_bookings', 'total_revenue', 'total_spent', 'average_rating', 'review_count',
             'occupancy_rate')
        order by column_name`,
    );

    expect(result.rows.map((row) => row.column_name)).toEqual([]);
  });
});
