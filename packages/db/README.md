# @hotel-booking/db

PostgreSQL schema, migrations, authorisation helpers and the typed Drizzle client shared by the
API. Migrations are reviewed SQL under `migrations/`; the schema source of truth is
`src/schema/`.

## Commands

```bash
pnpm --filter @hotel-booking/db db:generate   # generate SQL from schema changes
pnpm --filter @hotel-booking/db db:migrate    # apply pending migrations
pnpm --filter @hotel-booking/db db:check      # journal check + schema drift check
pnpm --filter @hotel-booking/db test          # real-PostgreSQL constraint and authz tests
```

`TEST_DATABASE_URL` must point at a disposable PostgreSQL database for the tests. CI applies
migrations before running them; the constraint suite also runs `db:migrate` itself.

## Schema (v1 + M1-16)

```mermaid
erDiagram
  users ||--o| credentials : "password (optional)"
  users ||--o{ oauth_accounts : "external identity"
  users ||--o{ memberships : "belongs to"
  organisations ||--o{ memberships : "has members"
  organisation_roles ||--o{ memberships : "role"
  organisation_roles ||--o{ role_permissions : "grants"
  users ||--o{ hotels : "owns directly / creates"
  organisations ||--o{ hotels : "owns"
  users ||--o{ bookings : "books / creates"
  organisations ||--o{ bookings : "books on behalf of"
  users ||--o{ reviews : "writes"

  hotels ||--o{ hotel_images : "gallery"
  hotels ||--o{ bookings : "receives"
  hotels ||--o{ reviews : "rated by"
  hotels ||--o{ hotel_facilities : "has"
  facilities ||--o{ hotel_facilities : "used by"
  hotels ||--o{ hotel_hotel_types : "categorised as"
  hotel_types ||--o{ hotel_hotel_types : "applies to"

  bookings ||--o{ reviews : "reviewed by"

  users {
    uuid id PK
    text email "unique, case-insensitive"
    user_role role "user | admin"
    user_status status
    timestamptz email_verified_at
  }
  credentials {
    uuid user_id PK
    text password_hash "null for OAuth-only accounts"
  }
  oauth_accounts {
    uuid id PK
    uuid user_id FK
    text provider
    text provider_account_id
  }
  organisations {
    uuid id PK
    text name
    text slug "unique"
    organisation_status status
  }
  organisation_roles {
    text role_key PK "owner | manager | member | viewer"
    text name
    text description
  }
  role_permissions {
    text role_key PK, FK
    text permission PK "code constant"
  }
  memberships {
    uuid user_id PK, FK
    uuid organisation_id PK, FK
    text role_key FK
  }
  hotels {
    uuid id PK
    hotel_source source
    uuid owner_user_id FK "direct user owner"
    uuid organisation_id FK "organisation owner"
    uuid created_by_user_id FK "who created the row"
    char country_code "ISO 3166-1 alpha-2"
    numeric latitude
    numeric longitude
    smallint star_rating "1..5"
    integer price_per_night_minor
    char currency_code
    hotel_status status
  }
  hotel_images {
    uuid id PK
    uuid hotel_id FK
    text url
    smallint position
  }
  facilities {
    uuid id PK
    text code "unique"
    text name
  }
  hotel_facilities {
    uuid hotel_id PK
    uuid facility_id PK
  }
  hotel_types {
    uuid id PK
    text code "unique"
    text name
  }
  hotel_hotel_types {
    uuid hotel_id PK
    uuid hotel_type_id PK
  }
  bookings {
    uuid id PK
    uuid user_id FK "guest / direct owner"
    uuid hotel_id FK
    uuid organisation_id FK "booked on behalf of"
    uuid created_by_user_id FK
    date check_in
    date check_out
    booking_status status
    integer version
  }
  reviews {
    uuid id PK
    uuid booking_id FK
    uuid user_id FK
    uuid hotel_id FK
    smallint rating "1..5"
    smallint cleanliness "1..5"
    smallint service "1..5"
    smallint location "1..5"
    smallint value "1..5"
    smallint amenities "1..5"
  }
```

A managed hotel must have an `owner_user_id`, an `organisation_id`, or both. A booking always has a
guest (`user_id`) and a creator (`created_by_user_id`); `organisation_id` is set when it is booked
on behalf of an organisation. Organisation ownership is optional, so adding an agency booking does
not change the booking shape.

`bookings` still carries only identity, ownership and stay dates so reviews can reference a real
row. [M1-05 (#35)](https://github.com/hasnaintypes/hotel-booking-platform/issues/35) adds guest
details, integer minor-unit money, supplier references, snapshots and idempotency;
[M1-17 (#102)](https://github.com/hasnaintypes/hotel-booking-platform/issues/102) adds currencies
and exchange-rate snapshots and the currency foreign keys.

## Authorisation model

Permissions are code constants in `src/authz.ts`; roles and their grants are seeded data in
`organisation_roles` and `role_permissions`.

| Role      | Grants                                                                                                                 |
| --------- | ---------------------------------------------------------------------------------------------------------------------- |
| `owner`   | All hotel, booking and organisation permissions, plus membership management.                                            |
| `manager` | Hotel read/create/update, booking read/create/update/cancel, organisation read.                                        |
| `member`  | Hotel read, booking read/create/update, organisation read.                                                            |
| `viewer`  | Hotel read, booking read, organisation read.                                                                          |

A regular user gets access from exactly one of:

- direct ownership — `hotels.owner_user_id` for hotels, `bookings.user_id` for bookings;
- a membership in the resource's own organisation whose role grants the permission;
- the platform `admin` role.

`createAuthorizer(db).can(actor, permission, resource)` is the helper guards and services use.
Memberships in other organisations never apply, and a suspended organisation grants nothing, so
joining an extra organisation cannot widen access. An authenticated user may create their own
booking; creating one for an organisation requires a membership grant such as `booking:create` on
that organisation.

## Conventions

- **Naming:** plural `snake_case` tables and columns; `*_id` for foreign keys; index and
  constraint names state the table and intent (`reviews_booking_user_unique`).
- **Identifiers:** UUID primary keys. The database default is `gen_random_uuid()` so raw SQL and
  tests work; application code generates sortable UUIDv7, with UUIDv4 as the fallback (ADR-002).
- **Time:** every timestamp is `timestamp with time zone`; `created_at`/`updated_at` default to
  `now()`.
- **Money:** integer minor units plus an explicit ISO-4217 currency code. No floating point
  columns for money. GBP is the only enabled currency until #102 lands.
- **Location:** `country_code` is a two-letter ISO 3166-1 alpha-2 code enforced by a `CHECK`;
  coordinates are bounded by `CHECK` constraints.
- **Soft delete:** users have a `status` (`active`/`suspended`), hotels have a `status`
  (`draft`/`active`/`inactive`/`archived`) and organisations have a `status`
  (`active`/`suspended`). There are no `is_deleted` flags; hard deletion is reserved for genuinely
  disposable rows and uses the explicit `ON DELETE` action on each FK.
- **Foreign keys:** every relationship is a real FK with an explicit `ON DELETE` action. Ownership
  rows use `RESTRICT`; dependent rows (credentials, OAuth accounts, images, joins, reviews,
  memberships) use `CASCADE`. A role in use cannot be deleted (`RESTRICT`).
- **Integrity:** case-insensitive unique email, unique OAuth `(provider, provider_account_id)`,
  unique organisation slug, unique membership `(user_id, organisation_id)`, unique review
  `(booking_id, user_id)`, rating and category `CHECK`s, permission vocabulary `CHECK`s,
  non-negative amounts, and `check_out > check_in`.
- **No counters:** `totalBookings`, `totalRevenue`, `totalSpent`, `averageRating`, `reviewCount`
  and `occupancyRate` do not exist as columns; reporting computes them in SQL (#41).
- **Extensions:** `pg_trgm` is created by the custom migration `0001_enable_pg_trgm.sql` for the
  hotel city/country trigram indexes. It ships with PostgreSQL contrib and is available on the
  local, CI and Render images.

## Applying changes

1. Edit the relevant file in `src/schema/` and export it from `src/schema/index.ts`.
2. Run `pnpm --filter @hotel-booking/db db:generate` and review the generated SQL. Backfill new
   `NOT NULL` ownership columns in the migration before adding the constraint.
3. Update `EXPECTED_MIGRATION_COUNT` in `src/migrations.ts` (the manifest test enforces this).
4. Run `db:migrate`, `db:check` and `pnpm --filter @hotel-booking/db test`.
