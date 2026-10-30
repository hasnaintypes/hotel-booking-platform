# Hotel Booking API

NestJS 11 + TypeScript + Mongoose backend for the Hotel Booking platform. The API preserves the existing HTTP contract (`/api/*`) while using a modular Nest application structure: feature modules, controllers, services, DTOs, guards, and schema definitions.

## Stack

| Concern       | Technology                                                        |
| ------------- | ----------------------------------------------------------------- |
| Runtime       | Node.js 22, TypeScript 6                                          |
| Framework     | NestJS 11 (`@nestjs/platform-express`)                            |
| Database      | MongoDB + Mongoose 9 via `@nestjs/mongoose`                       |
| Auth          | `@nestjs/jwt`, bcryptjs, custom `JwtAuthGuard`, optional Google OAuth |
| Validation    | `class-validator` + `class-transformer` (global `ValidationPipe`) |
| Docs          | `@nestjs/swagger` at `/api-docs`                                  |
| Security      | Helmet, `@nestjs/throttler`, CORS allowlist, cookie parser        |
| Logging       | `nestjs-pino` / `pino-http`                                       |
| Payments      | Stripe PaymentIntents                                             |
| Images        | Cloudinary + multer memory storage                                |
| AI assist     | Groq / OpenAI / OpenRouter with a deterministic stub fallback     |

## Structure

```text
apps/api/
├── src/
│   ├── main.ts                     # bootstrap, global middleware, Swagger
│   ├── app.module.ts               # root module composition
│   ├── app.controller.ts           # GET / banner
│   ├── config/
│   │   ├── configuration.ts        # typed config factory
│   │   ├── env.validation.ts       # required env fail-fast
│   │   └── swagger.config.ts       # OpenAPI document setup
│   ├── common/
│   │   ├── decorators/             # @CurrentUser, @Roles
│   │   ├── guards/                 # JwtAuthGuard, RolesGuard
│   │   ├── filters/                # AllExceptionsFilter
│   │   ├── types/                  # JwtPayload
│   │   └── common.module.ts
│   ├── database/
│   │   ├── database.module.ts      # global Mongoose forRoot/forFeature
│   │   ├── models.ts               # model name constants
│   │   └── seeds/seed.ts           # demo data seed
│   ├── integrations/
│   │   ├── stripe/                 # StripeService
│   │   ├── cloudinary/             # CloudinaryService
│   │   └── llm/                    # LlmService (provider failover)
│   └── modules/
│       ├── auth/                   # login, Google OAuth, token validation, logout
│       ├── users/                  # registration, profile, roles
│       ├── hotels/                 # search, detail, visibility, booking/payment
│       ├── my-hotels/              # owner CRUD + multipart image upload
│       ├── bookings/               # booking management
│       ├── reviews/                # hotel reviews
│       ├── business-insights/      # dashboard, forecast, system stats
│       ├── analytics/              # rollup snapshots
│       ├── ai/                     # hotel description drafting
│       └── health/                 # liveness + detailed health
├── Dockerfile
├── nest-cli.json
├── tsconfig.json
└── tsconfig.build.json
```

Each feature module contains its controller, service, DTOs, and (where relevant) Mongoose schemas. Schemas export raw `Schema` objects; `DatabaseModule` registers them globally with `MongooseModule.forFeature`.

## Environment

Copy `.env.example` to `.env` in `apps/api` and fill in the values.

### Required

| Variable                    | Purpose                          |
| --------------------------- | -------------------------------- |
| `MONGODB_CONNECTION_STRING` | MongoDB connection URI           |
| `JWT_SECRET_KEY`            | JWT signing secret               |
| `CLOUDINARY_CLOUD_NAME`     | Cloudinary cloud name            |
| `CLOUDINARY_API_KEY`        | Cloudinary API key               |
| `CLOUDINARY_API_SECRET`     | Cloudinary API secret            |
| `STRIPE_API_KEY`            | Stripe secret key (`sk_test_…`)  |

The app exits during startup if any required variable is missing (`config/env.validation.ts`).

### Optional

| Variable                  | Default                        | Purpose                                    |
| ------------------------- | ------------------------------ | ------------------------------------------ |
| `PORT`                    | `5001`                         | HTTP port                                  |
| `NODE_ENV`                | `development`                  | Runtime mode                               |
| `FRONTEND_URL`            | `http://localhost:5174`        | CORS + OAuth redirect target               |
| `BACKEND_URL`             | `http://localhost:${PORT}`     | Public API origin for Google `redirect_uri`|
| `GOOGLE_ID` / `GOOGLE_SECRET` | —                          | Google OAuth                               |
| `AI_ASSIST_ENABLED`       | `false`                        | Enables the AI draft endpoint              |
| `GROQ_API_KEY` / `GROQ_MODEL` | —                          | Groq provider                              |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | —                      | OpenAI provider                            |
| `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` | —                | OpenRouter provider                        |

Google OAuth callback locally: `http://localhost:5001/api/auth/callback/google`.

## Scripts

Run from `apps/api` or filter from the repo root.

```bash
pnpm --filter @hotel-booking/api dev        # nest start --watch
pnpm --filter @hotel-booking/api build      # nest build -> dist/apps/api/src/main.js
pnpm --filter @hotel-booking/api start      # node dist/apps/api/src/main.js
pnpm --filter @hotel-booking/api typecheck  # tsc --noEmit
pnpm --filter @hotel-booking/api lint       # eslint
pnpm --filter @hotel-booking/api seed       # reset + seed demo data
```

The build uses `rootDir: "../.."` so it can consume `@hotel-booking/types` source directly.

## Request lifecycle

1. `ConfigModule.forRoot` loads and validates environment variables.
2. Global middleware: Helmet, compression, cookie parser, CORS, JSON body parser, Pino HTTP logging.
3. `ValidationPipe` runs with `whitelist`, `transform`, and `enableImplicitConversion`.
4. Route guards run (`JwtAuthGuard`, then `RolesGuard` when `@Roles` is present).
5. The controller delegates to a feature service.
6. `AllExceptionsFilter` normalises errors to the legacy `{ message }` shape, except controller-thrown payloads such as `{ error, message }` from business insights.

Authentication reads `Authorization: Bearer <token>` first and falls back to the `session_id` cookie. Logout clears the same cookie.

## Endpoints

Base URL locally: `http://localhost:5001`

### Auth — `/api/auth`

| Method | Path               | Auth | Description                          |
| ------ | ------------------ | ---- | ------------------------------------ |
| GET    | `/google`          | —    | Start Google OAuth                   |
| GET    | `/callback/google` | —    | OAuth callback, redirect with token  |
| POST   | `/login`           | —    | Email/password login                 |
| GET    | `/validate-token`  | JWT  | Validate token, return `{ userId }`  |
| POST   | `/logout`          | —    | Clear session cookie                 |

### Users — `/api/users`

| Method | Path        | Auth  | Description                  |
| ------ | ----------- | ----- | ---------------------------- |
| POST   | `/register` | —     | Register a user              |
| GET    | `/me`       | JWT   | Current profile              |
| GET    | `/`         | Admin | List users                   |
| PATCH  | `/:id/role` | Admin | Update a user role           |

### Hotels — `/api/hotels`

| Method | Path                                | Auth | Description                       |
| ------ | ----------------------------------- | ---- | --------------------------------- |
| GET    | `/`                                 | —    | List hotels                       |
| GET    | `/search`                           | —    | Filtered, paginated search        |
| GET    | `/:id`                              | —    | Hotel detail                      |
| PATCH  | `/:id/active`                       | Admin| Toggle visibility                 |
| POST   | `/:hotelId/bookings/payment-intent` | JWT  | Create Stripe PaymentIntent       |
| POST   | `/:hotelId/bookings`                | JWT  | Confirm booking after payment     |

Search query params: `destination`, `adultCount`, `childCount`, `facilities[]`, `types[]`, `stars[]`, `maxPrice`, `sortOption`, `page`.

### My hotels — `/api/my-hotels`

| Method | Path         | Auth | Description                       |
| ------ | ------------ | ---- | --------------------------------- |
| POST   | `/`          | JWT  | Create hotel with multipart images|
| GET    | `/`          | JWT  | List owned hotels                 |
| GET    | `/:id`       | JWT  | Get one owned hotel               |
| PUT    | `/:hotelId`  | JWT  | Update owned hotel                |

### My bookings — `/api/my-bookings`

| Method | Path | Auth | Description                                  |
| ------ | ---- | ---- | -------------------------------------------- |
| GET    | `/`  | JWT  | Guest bookings with populated hotel details  |

### Bookings — `/api/bookings`

| Method | Path              | Auth | Description                         |
| ------ | ----------------- | ---- | ----------------------------------- |
| GET    | `/`               | JWT  | List bookings                       |
| GET    | `/hotel/:hotelId` | JWT  | Bookings for a hotel                |
| GET    | `/:id`            | JWT  | Booking by id                       |
| PATCH  | `/:id/status`     | JWT  | Update status                       |
| PATCH  | `/:id/payment`    | JWT  | Update payment status               |
| POST   | `/:id/cancel`     | JWT  | Cancel booking                      |
| DELETE | `/:id`            | JWT  | Delete booking and adjust totals    |

### Reviews — `/api/reviews`

| Method | Path | Auth  | Description          |
| ------ | ---- | ----- | -------------------- |
| GET    | `/`  | Admin | List all reviews     |
| POST   | `/`  | JWT   | Create a hotel review|

### Business insights — `/api/business-insights`

| Method | Path                                          | Auth    | Description   |
| ------ | --------------------------------------------- | ------- | ------------- |
| GET    | `/dashboard` · `/dashboard/public`             | JWT / — | Metrics       |
| GET    | `/forecast` · `/forecast/public`               | JWT / — | Forecast      |
| GET    | `/system-stats` · `/system-stats/public`       | JWT / — | System stats  |

### Analytics — `/api/business-insights`

| Method | Path       | Auth  | Description                    |
| ------ | ---------- | ----- | ------------------------------ |
| POST   | `/rollups` | Admin | Persist an analytics snapshot  |

### AI — `/api/ai`

| Method | Path       | Auth | Description                    |
| ------ | ---------- | ---- | ------------------------------ |
| POST   | `/suggest` | JWT  | Draft a hotel description      |

### Health — `/api/health`

| Method | Path        | Auth | Description                                        |
| ------ | ----------- | ---- | -------------------------------------------------- |
| GET    | `/`         | —    | Liveness, timestamp, database status               |
| GET    | `/detailed` | JWT  | Rounded memory, uptime, and database details       |

Interactive documentation: `http://localhost:5001/api-docs`.

## Seed data

```bash
pnpm --filter @hotel-booking/api seed
```

This drops and reseeds `User`, `Hotel`, `Booking`, `Review`, and `Analytics` collections. Demo logins after seeding:

- `test@user.com` / `12345678` (admin)
- `owner@hotel.com` / `12345678`
- `guest@user.com` / `12345678`

## Deployment

The Dockerfile builds from the repository root so workspace packages are available:

```bash
docker build -f apps/api/Dockerfile -t hotel-booking-api .
```

Runtime command: `node dist/apps/api/src/main.js`. The container health check calls `GET /api/health` on `PORT` (default `5001`). Provide all required environment variables in the hosting platform.
