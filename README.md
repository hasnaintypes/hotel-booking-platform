# Hotel Booking Platform

[![CI](https://github.com/hasnaintypes/hotel-booking-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/hasnaintypes/hotel-booking-platform/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/Node-22-339933)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6)](https://www.typescriptlang.org/)

A full-stack hotel marketplace. Guests search hotels and pay for stays with Stripe, hotel owners list and manage properties, and admins moderate the platform from a separate console. It is a TypeScript pnpm/Turborepo monorepo with a NestJS + MongoDB API and two React single-page apps.

## Features

- **Guests:** search by destination, guests, price, stars, type and facilities; hotel detail pages; email/password or Google sign-in; Stripe card checkout (GBP); my bookings, cancellation with automatic refund; reviews tied to their bookings.
- **Hotel owners:** create and edit hotels with up to 6 images (Cloudinary); per-hotel booking log; activate/deactivate listings.
- **Admins** (`apps/admin`): dashboard, hotels, users and roles, bookings, reviews, activity.
- **Insights (admin only):** business dashboard, forecast and system stats; optional LLM-drafted copy (draft-only, off by default).
- **Platform:** httpOnly cookie sessions with origin (CSRF) checks, rate limiting, Helmet, Pino logging, Swagger docs at `/api-docs`.

## Architecture

```text
 web SPA :5174        admin SPA :5175
        │  HTTPS + httpOnly session cookie
        └───────────────┬───────────────┘
                        ▼
                NestJS API :5001 ── MongoDB
                        ├────────── Stripe
                        ├────────── Cloudinary
                        └────────── Google OAuth (optional)
```

| Path | Package | Purpose |
| --- | --- | --- |
| `apps/api` | `@hotel-booking/api` | NestJS REST API, Mongoose models, integrations |
| `apps/web` | `@hotel-booking/web` | Guest and hotel-owner SPA (React 19, Vite) |
| `apps/admin` | `@hotel-booking/admin` | Admin SPA |
| `packages/types` | `@hotel-booking/types` | Shared TypeScript contracts |
| `packages/api-client` | `@hotel-booking/api-client` | Axios instance, session store, TanStack Query client |
| `packages/ui` | `@hotel-booking/ui` | Shared UI components and Tailwind preset |

**Stack:** NestJS 11, Mongoose 9, MongoDB, React 19, Vite 8, React Router 7, TanStack Query 5, Tailwind CSS 4, Radix UI, Stripe, Cloudinary, Vitest.

Deeper documentation (architecture, API, data model, patterns, deployment) is in [`docs/`](docs/INDEX.md) when present locally.

## Getting started

**Prerequisites:** Node 22, pnpm 10.15 (`corepack enable`), Docker (or a MongoDB Atlas URI), and Stripe and Cloudinary test accounts.

```bash
pnpm install --frozen-lockfile
docker compose up -d mongo            # local MongoDB on :27017

cp apps/api/.env.example   apps/api/.env      # fill in the required values
cp apps/web/.env.example   apps/web/.env
cp apps/admin/.env.example apps/admin/.env

pnpm dev                              # API, web and admin together
```

| App | URL |
| --- | --- |
| API | http://localhost:5001 (health: `/api/health`, Swagger: `/api-docs`) |
| Web | http://localhost:5174 |
| Admin | http://localhost:5175 |

To use the admin console, register a user in the web app and set that user's `role` to `admin` in MongoDB.

## Configuration

The API exits at startup if a required variable is missing. Browser apps only receive `VITE_`-prefixed values, which are embedded in the build; never put secrets there.

| Variable | App | Required | Purpose |
| --- | --- | --- | --- |
| `MONGODB_CONNECTION_STRING` | api | Yes | MongoDB URI |
| `JWT_SECRET_KEY` | api | Yes | JWT signing secret (`openssl rand -base64 64`) |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | api | Yes | Image uploads |
| `STRIPE_API_KEY` | api | Yes | Stripe secret key (`sk_test_…` locally) |
| `FRONTEND_URL`, `ADMIN_URL`, `BACKEND_URL` | api | No | CORS/origin allow-list and OAuth redirects (default to localhost) |
| `PORT` | api | No | Default `5001` |
| `BOOKING_MAX_NIGHTS` | api | No | Longest bookable stay in nights, 1 to 365 (default `30`) |
| `GOOGLE_ID`, `GOOGLE_SECRET` | api | No | Google sign-in; register `{BACKEND_URL}/api/auth/callback/google` |
| `CLOUDINARY_FOLDER` | api | No | Cloudinary folder for hotel images (default `hotel-booking/<NODE_ENV>`) |
| `AI_ASSIST_ENABLED`, `GROQ_*`, `OPENAI_*`, `OPENROUTER_*` | api | No | Optional LLM drafts; off unless `AI_ASSIST_ENABLED=true` (see below) |
| `AI_DAILY_QUOTA`, `AI_PER_MINUTE_LIMIT`, `AI_REQUEST_DEADLINE_MS` | api | No | Per-user AI limits (defaults `20` a day, `5` a minute) and the time allowed for one request across all providers (default `30000`) |
| `VITE_API_BASE_URL` | web, admin | Recommended | API origin (falls back to `http://localhost:5001`) |
| `VITE_STRIPE_PUB_KEY` | web | For payments | Stripe publishable key |
| `VITE_ADMIN_URL` / `VITE_WEB_URL` | web / admin | No | Cross-links between the apps |

See each app's `.env.example` for the full template.

### AI draft assist (optional, off by default)

`POST /api/ai/suggest` drafts a hotel description (any signed-in user) or a short insights blurb (admins only). It only returns text for a person to review; nothing is saved automatically.

- **Cost:** each request calls a paid provider (Groq, OpenAI or OpenRouter, in that order) when a key is configured. Input is limited to 2,000 characters, each user is limited per minute and per day, a request makes at most three provider calls, and one deadline covers the whole request. The daily and per-minute counters are kept in memory, so they reset when the server restarts and are not shared between instances.
- **Privacy:** the text a user enters is sent to the configured provider. Prompts and drafts are never written to the application logs, which record only the provider, model, latency and outcome. Do not enter personal data.
- **Failure:** if a provider rejects the request (HTTP 400, 401 or 403) the other providers are not tried, and the response is a local stub draft; the rejection is logged at `error` so a bad key is visible.
- **Output:** treated as untrusted text: control and invisible characters are removed, the length is capped, and it is never rendered as HTML.

## Scripts

Run from the repository root.

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start all apps in watch mode |
| `pnpm build` | Build all workspaces |
| `pnpm lint` | ESLint with zero warnings allowed |
| `pnpm typecheck` | `tsc --noEmit` in every workspace |
| `pnpm test` | Vitest (web and admin) |
| `pnpm check:bundle` | Enforce the entry-bundle budget (run after `build`) |
| `pnpm format:check` / `pnpm format:code` | Prettier check / write for `apps` and `packages` |

Run a single test file with `pnpm --filter @hotel-booking/admin exec vitest run <path>`.

> `pnpm --filter @hotel-booking/api seed` **deletes all collections** before inserting sample data. Use it only on a disposable database.

## Quality and CI

GitHub Actions (`.github/workflows/ci.yml`) runs install, lint, typecheck, test, build and the bundle check on every pull request and push to `main`. Unit tests currently cover the shared auth-session store and the admin guard and booking rules; the API, payment and refund flows have no automated tests yet.

## Deployment

> **Do not deploy to production before milestone M2.** Payments and bookings are not production-ready: the charged amount is not reconciled with the booked dates, a payment can be replayed to create duplicate bookings, and there is no payment webhook or reconciliation. The API therefore refuses to start with `NODE_ENV=production` and a live Stripe key (`sk_live_…` or `rk_live_…`); use `sk_test_…`. The guard is removed when M2 completes.
>
> Priority principle: payment and booking correctness (M0 to M2) is delivered before advanced features (M3 onwards).

- **API:** Docker image built from the **repository root** (`docker build -f apps/api/Dockerfile .`), exposing port 5001 with a `/api/health` healthcheck. Set all required variables, `NODE_ENV=production`, and `FRONTEND_URL`, `ADMIN_URL` and `BACKEND_URL` to the public origins.
- **Web and admin:** deployed as two Vercel projects (root directories `apps/web` and `apps/admin`) using each app's `vercel.json`, which sets the SPA rewrite, security headers and a Content-Security-Policy. Any new script, frame or connect origin must be added to the CSP.
- **Production checklist:** secrets only in the host dashboards; live Stripe keys match the mode; Google redirect URI matches `BACKEND_URL`; API and SPA origins are listed in `FRONTEND_URL`/`ADMIN_URL`.

## Contributing

- Never push to `main`. Create a branch (`feat/…`, `fix/…`, `docs/…`), keep commits small with a Conventional Commit subject such as `feat(web): …`, and open a pull request. `main` is protected and requires the `verify` check to pass.
- Before opening a PR run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm check:bundle`.
- Style: TypeScript, two-space indent, double quotes, 100-column Prettier.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| API exits immediately | A required environment variable is missing; the log lists which |
| CORS or 403 "origin not allowed" | `FRONTEND_URL` / `ADMIN_URL` must exactly match the SPA origin |
| Signed in but immediately signed out | Cookie not sent: check the API origin in `VITE_API_BASE_URL`; in production cross-site cookies need HTTPS |
| Payment form does nothing | Set `VITE_STRIPE_PUB_KEY` and use matching `pk_test`/`sk_test` keys |
| Image upload fails | Check the three Cloudinary variables |
| Google sign-in fails | Register the exact callback URI and set `BACKEND_URL` |

## License

Released under the [MIT License](LICENSE). Third-party code policy: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). To report a vulnerability, see [SECURITY.md](SECURITY.md).
