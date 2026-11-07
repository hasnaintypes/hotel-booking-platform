# @hotel-booking/api

NestJS 11 REST API for the hotel booking platform. It serves the `/api/v1` HTTP contract and is
organised as a modular monolith: one Nest module per domain, with PostgreSQL access isolated behind
typed repositories.

See the [root README](../../README.md) for setup, environment variables, deployment and the
production-readiness warning. This file only covers what is specific to the API.

## Stack

Node 22, TypeScript, NestJS 11 (`@nestjs/platform-express`), PostgreSQL 17 + Drizzle ORM, `@nestjs/jwt` + bcryptjs, `class-validator`/`class-transformer`,
`@nestjs/swagger`, `@nestjs/throttler`, Pino logging, Stripe PaymentIntents, Cloudinary, and an
optional LLM provider chain.

## Structure

```text
src/
├── main.ts                 # bootstrap
├── app.setup.ts            # shared request pipeline (also used by tests)
├── app.module.ts
├── config/                 # typed config, env validation, Swagger
├── common/                 # auth guards, routing, errors, logging, uploads, security
├── routes/                 # audience route groups (public, manage, admin, partner)
├── database/               # PostgreSQL provider, repositories, seed script
├── integrations/           # Stripe, Cloudinary, LLM
└── modules/<domain>/       # controller, service, DTOs
```

## Data access

PostgreSQL access is isolated behind repositories in `src/database/repositories/`. Domain modules
must not import `@hotel-booking/db` directly (enforced by ESLint); a repository injects the global
`DATABASE` token and exposes domain-shaped methods.

Use `withTransaction(db, fn, options)` from `@hotel-booking/db` for multi-statement writes. It
supports isolation levels and bounded retries on serialization failures and deadlocks; the callback
may run more than once, so keep external side effects outside it.

PostgreSQL errors are mapped centrally to typed HTTP problems: unique violations become 409,
constraint violations 422, invalid values 400, and exhausted transaction conflicts 409. Repositories
can use `throwPostgresError(error)` to translate an error at the boundary.

## Request lifecycle

`app.setup.ts` applies the global `api` prefix and URI version 1, then wires Helmet, CORS, cookie parsing, the global `ThrottlerGuard`, `OriginGuard`
(CSRF defence for cookie auth), a `ValidationPipe` (`whitelist`, `transform`, **no** implicit type
conversion — DTOs convert query/multipart text explicitly), and a global exception filter that
returns problem-details bodies (`code`, `detail`, optional field `errors`). Security-sensitive
routes add `JwtAuthGuard`/`OptionalJwtAuthGuard` and `RolesGuard`; both re-check the account's
`isActive`/`role` from the database rather than trusting the token.

## Running

From the repository root:

```bash
pnpm --filter @hotel-booking/api dev        # nest start --watch, http://localhost:5001
pnpm --filter @hotel-booking/api build
pnpm --filter @hotel-booking/api test       # unit + e2e specs
pnpm --filter @hotel-booking/api lint
pnpm --filter @hotel-booking/api typecheck
SEED_PASSWORD='...' pnpm --filter @hotel-booking/api seed  # deterministic PostgreSQL fixtures; no truncate
pnpm --filter @hotel-booking/api gen:controller <audience> <resource>  # scaffold a controller
```

API docs are served at `/api-docs` (combined) and `/api/docs/<audience>` in development; they
are disabled in production unless `ENABLE_API_DOCS=true`, and admin-only when enabled there.
Health is unversioned at `/health/live` and `/health/ready`; detailed diagnostics are admin-only
at `/api/v1/admin/system/health`.

## Configuration

Copy `.env.example` to `.env`. The app refuses to start without `JWT_SECRET_KEY`, the three `CLOUDINARY_*` values and `STRIPE_API_KEY`; the root README lists every
variable. `NODE_ENV=production` with a live Stripe key is rejected until milestone M2.

## Tests

`test/` holds end-to-end specs that boot the real `AppModule` through `app.setup.ts` with Stripe,
Cloudinary and the log sink replaced by fakes. The suite uses a disposable PostgreSQL database
(`TEST_DATABASE_URL`) that CI migrates before running the tests. Controller routes are referenced
through `test/support/routes.ts`. Unit specs live beside their sources as `*.spec.ts`.

## Docker

The image must be built from the repository root so workspace packages are available:

```bash
docker build -f apps/api/Dockerfile -t hotel-booking-api .
```

The container runs as the non-root `node` user, listens on `PORT` (default `5001`), and exposes
`GET /health/live` for the health check.
