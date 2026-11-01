# @hotel-booking/api

NestJS 11 + Mongoose REST API for the hotel booking platform. It keeps the `/api/*` HTTP contract
and is organised as a modular monolith: one Nest module per domain, services injecting Mongoose
models directly (there is no repository layer).

See the [root README](../../README.md) for setup, environment variables, deployment and the
production-readiness warning. This file only covers what is specific to the API.

## Stack

Node 22, TypeScript, NestJS 11 (`@nestjs/platform-express`), MongoDB + Mongoose 9, `@nestjs/jwt` +
bcryptjs, `class-validator`/`class-transformer`, `@nestjs/swagger`, `@nestjs/throttler`, Pino
logging, Stripe PaymentIntents, Cloudinary, and an optional LLM provider chain.

## Structure

```text
src/
├── main.ts                 # bootstrap
├── app.setup.ts            # shared request pipeline (also used by tests)
├── app.module.ts
├── config/                 # typed config, env validation, Swagger
├── common/                 # auth guards, routing, errors, logging, uploads, security
├── database/               # global Mongoose registration, model tokens, seed script
├── integrations/           # Stripe, Cloudinary, LLM
└── modules/<domain>/       # controller, service, DTOs, schema
```

## Request lifecycle

`app.setup.ts` wires Helmet, CORS, cookie parsing, the global `ThrottlerGuard`, `OriginGuard`
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
pnpm --filter @hotel-booking/api seed       # DESTRUCTIVE: drops all five collections first
```

API docs are served at `/api-docs` in development; they are disabled in production unless
`ENABLE_API_DOCS=true`, and admin-only when enabled there. Health is at `/api/health`.

## Configuration

Copy `.env.example` to `.env`. The app refuses to start without `MONGODB_CONNECTION_STRING`,
`JWT_SECRET_KEY`, the three `CLOUDINARY_*` values and `STRIPE_API_KEY`; the root README lists every
variable. `NODE_ENV=production` with a live Stripe key is rejected until milestone M2.

## Tests

`test/` holds end-to-end specs that boot the real `AppModule` through `app.setup.ts` with Stripe,
Cloudinary and the log sink replaced by fakes. `test/global-setup.ts` starts an in-memory MongoDB
locally, while CI points `MONGODB_TEST_URI` at a `mongo:7` service. Controller routes are referenced
through `test/support/routes.ts`. Unit specs live beside their sources as `*.spec.ts`.

## Docker

The image must be built from the repository root so workspace packages are available:

```bash
docker build -f apps/api/Dockerfile -t hotel-booking-api .
```

The container runs as the non-root `node` user, listens on `PORT` (default `5001`), and exposes
`GET /api/health` for the health check.
