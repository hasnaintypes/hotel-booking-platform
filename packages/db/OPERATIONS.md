# Database operations

> Last updated: 2026-11-05

This is the operating baseline for the `@hotel-booking/db` package and every service that uses PostgreSQL. The API still reads and writes MongoDB for product
data, but PostgreSQL is the system of record for the M1 schema and every future booking path.

## Connection pool and timeouts

The shared client is `packages/db/src/client.ts`. Defaults are deliberately short because API
requests should fail fast rather than queue behind a lock or a slow query:

| Setting | Default | Environment variable |
| --- | --- | --- |
| Pool size | 10 connections | `DATABASE_POOL_MAX` |
| Statement timeout | 5 s | `DATABASE_STATEMENT_TIMEOUT_MS` |
| Idle-in-transaction timeout | 10 s | `DATABASE_IDLE_IN_TRANSACTION_TIMEOUT_MS` |
| Lock timeout | 3 s | `DATABASE_LOCK_TIMEOUT_MS` |

All four are whole numbers, validated at API startup. `createDb()` applies the timeouts as session
defaults, so they cover every query on a pooled connection.

Size the pool as:

```text
API instances × DATABASE_POOL_MAX + migration/ops connections < database connection limit
```

Leave at least two connections for migrations and an operator session. If the provider exposes a
pooling proxy, use its connection string and count the proxy's server-side limit, not the raw
database limit.

For a request that genuinely needs different limits, wrap it in `withDatabaseTimeouts`:

```ts
await withDatabaseTimeouts(db, { statementTimeoutMs: 30_000, lockTimeoutMs: 10_000 }, async (tx) => {
  // work that must not use the short API defaults
});
```

The overrides use `set_config(..., true)` and end with the transaction; they never leak back into
the pool.

## Health checks

- `GET /health/live` is a cheap process check. It does not touch MongoDB or PostgreSQL, so a
  database outage cannot restart a healthy container.
- `GET /health/ready` checks MongoDB, runs `select 1` on PostgreSQL, and compares Drizzle's
  applied migration count with `EXPECTED_MIGRATION_COUNT`. It returns 503 when either database is
  unavailable or migrations are pending.
- `GET /api/v1/admin/system/health` returns the same checks plus memory and uptime to an admin.

The container healthcheck uses liveness, not readiness. Readiness belongs in the platform's
deploy/traffic gate so a pending migration stops traffic without killing the process.

## Migration policy

Migrations are reviewed SQL under `packages/db/migrations/` and are generated from the Drizzle
schema; `pnpm --filter @hotel-booking/db db:check` rejects schema drift. They run as a pre-deploy
step, before the new application image receives traffic:

```bash
pnpm --filter @hotel-booking/db db:migrate
```

Rules:

1. **Forward-only.** Do not edit an applied migration; add a new one.
2. **Expand/contract.** Add nullable columns, new tables, indexes and backfills first; deploy code
   that writes both shapes; remove old columns or constraints in a later migration after the old
   code is gone.
3. **No destructive migration in one step.** A drop, type rewrite or `NOT NULL` addition that
   cannot be applied safely needs an explicit two-step plan with a backfill and verification.
4. **Readiness gates traffic.** The application reports `pending` until the applied count reaches
   the build's expected count.
5. **Rollback is a code rollback, not a schema rollback.** Migrations must leave the previous
   image working; otherwise deploy the previous image only after the expand step, never after a
   contract that removed data it needs.

## Backups and restore

Targets, to be confirmed against the Render plan when the database is provisioned:

| Item | Target |
| --- | --- |
| Automated backups | Daily |
| Retention | At least 7 days; longer if the plan provides it |
| Point-in-time recovery | Enable it when the plan supports it |
| RPO | 24 h without PITR; 5 min with PITR |
| RTO | 1 h for a scratch restore and cutover |

Never use a production dump as a local development seed. Restores go to a scratch database first,
are verified, and only then replace a production target.

### Restore drill procedure

1. Create a scratch database on a non-production instance.
2. Take a custom-format dump from the source:
   `pg_dump -Fc -d "$SOURCE_URL" -f /tmp/restore.drill`
3. Restore into the scratch database:
   `pg_restore -d "$SCRATCH_URL" /tmp/restore.drill`
4. Verify the schema and migration count:
   `select count(*) from drizzle.__drizzle_migrations;`
5. Run a smoke query against at least one domain table and compare row counts with the source.
6. Record the date, source, scratch target, migration count and result in the deployment log.
7. Drop the scratch database and delete the dump.

**Executed:** 2026-11-05 against a local `postgres:17-alpine` instance. A custom-format dump of the
migrated test database restored into a scratch database with all 6 migrations present and was then
dropped. This proves the procedure; repeat it on the provisioned Render instance before launch and
after any plan or storage change.

## Provisioning notes

### Render PostgreSQL

- Use the provider's connection string, not one assembled from separate host/user fields; keep
  `sslmode=require` in production.
- Pick an instance whose connection limit covers `API instances × DATABASE_POOL_MAX` plus
  migration/ops headroom. The default pool of 10 is a starting point, not a target.
- Prefer the internal connection URL for services in the same Render region; use the external URL
  only from a workstation or a runbook.
- Enable automated backups and PITR where the plan offers them, and confirm retention in the
  Render dashboard.
- Run migrations as a pre-deploy command/job, not from an application replica on startup.

### Local parity

`docker compose up -d postgres` starts PostgreSQL 17 with the same major version. The `postgres`
service mounts `docker/postgres/init` and exposes port 5432; `db:migrate` applies the same SQL used
in production. Tests use `TEST_DATABASE_URL` against a disposable database and never the developer
database.
