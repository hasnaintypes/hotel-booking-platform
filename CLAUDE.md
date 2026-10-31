# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

pnpm 10.15.0 / Turborepo monorepo, Node 22. Three apps (`apps/api` NestJS + MongoDB, `apps/web` guest/owner React SPA, `apps/admin` admin React SPA) share `packages/types`, `packages/api-client`, `packages/ui`. `docs/` holds a source-based map (start at `docs/INDEX.md`); it is git-ignored, as are `AGENTS.md` and `.claude/`.

## Commands

Run from the repo root.

```bash
pnpm install --frozen-lockfile
docker compose up -d mongo                 # local MongoDB 7 on :27017
pnpm dev                                   # all apps; or filter:
pnpm --filter @hotel-booking/api dev       # :5001 (Swagger at /api-docs, health at /api/health)
pnpm --filter @hotel-booking/web dev       # :5174
pnpm --filter @hotel-booking/admin dev     # :5175

pnpm lint            # eslint --max-warnings 0
pnpm typecheck
pnpm test            # vitest in web + admin only; the API has no tests
pnpm build
pnpm check:bundle    # run after build; entry chunks capped at 430 kB raw / 140 kB gzip
```

CI (`.github/workflows/ci.yml`) runs install → lint → typecheck → test → build → check:bundle. It does not run `format:check`, which currently fails on ~50 files; use `pnpm format:code` (apps/packages only) rather than `pnpm format` (whole repo) so you don't reformat unrelated files.

Single test file or name:

```bash
pnpm --filter @hotel-booking/admin exec vitest run src/features/auth/components/AdminGuard.test.tsx
pnpm --filter @hotel-booking/web exec vitest run -t "notifies subscribers"
```

**Never run `pnpm --filter @hotel-booking/api seed` against data you need**: it deletes all five collections. Use Stripe test keys and a disposable DB for payment, refund, upload and seed checks.

Setup: copy each app's `.env.example` to `.env`. The API refuses to start without `MONGODB_CONNECTION_STRING`, `JWT_SECRET_KEY`, the three `CLOUDINARY_*` vars and `STRIPE_API_KEY` (`apps/api/src/config/env.validation.ts`). `ADMIN_URL` is read by the API but missing from its `.env.example`.

## Architecture

**Packages are consumed as TypeScript source.** `packages/*` point `main`/`types` at `src/index.ts`, and the SPA Vite configs alias `@hotel-booking/ui` and `api-client` to those `src` dirs, so editing a package hot-reloads with no build. `apps/api` depends only on `@hotel-booking/types`. Each app maps `@/` to its own `src/`.

**API** (`apps/api/src`): modular monolith, one Nest module per domain under `modules/`. There is no repository layer: services inject Mongoose models directly (`@InjectModel(HOTEL_MODEL)`, tokens in `database/models.ts`) and `DatabaseModule` registers all five models globally, so a service may touch models owned by another module. Routes are declared with the `api/` prefix inside each `@Controller("api/...")`; there is no global prefix. Integrations (Stripe, Cloudinary, LLM) are wrapped in `integrations/`. Request pipeline: Helmet, CORS, global `ThrottlerGuard`, global `OriginGuard` (`main.ts`), global `ValidationPipe` (`whitelist`, `transform`), `AllExceptionsFilter`.

**Auth is split across layers.**
- The JWT lives in an httpOnly `session_id` cookie (`common/auth-cookie.ts`), set by login, register and the Google callback. `JwtAuthGuard` also accepts a Bearer header, which wins when present.
- `OriginGuard` is the CSRF defence: unsafe methods with an untrusted `Origin`/`Referer` are rejected. Bearer requests and requests with no Origin/Referer are exempt. The allow-list is exact-match on `FRONTEND_URL`, `ADMIN_URL`, `BACKEND_URL` and localhost ports 5173–5175 (`common/security/allowed-origins.ts`).
- `RolesGuard` re-reads the user's role from MongoDB on every `@Roles("admin")` call. Hotel-owner checks are ad hoc inside services (compare `hotel.userId`, as in `bookings.service.ts`); the `hotel_owner` role value is not used for authorization.
- The SPAs hold no credential. They keep a non-sensitive `auth_session=1` flag in localStorage, managed by the shared store in `packages/api-client/src/auth-session.ts`, to drive optimistic UI. `AuthProvider` only calls `/api/users/me` when the flag is set, and a 401 from the Axios interceptor clears it.

**Booking and money flow** (spans web → `HotelsService` → Stripe → `BookingsService`): the browser asks `POST /api/hotels/:id/bookings/payment-intent`, confirms the card with Stripe.js, then calls `POST /api/hotels/:id/bookings`, where `HotelsService.createBooking` verifies the PaymentIntent (metadata hotel and user match, status `succeeded`) and saves a `confirmed`/`paid` booking. Cancellation goes only through `POST /api/bookings/:id/cancel`, which issues the Stripe refund; `PATCH :id/status` rejects `cancelled`/`refunded`. Hotel and User carry denormalized counters (`totalBookings`, `totalRevenue`/`totalSpent`) adjusted by separate `$inc` writes with no transaction, so any new code path that creates, cancels or deletes bookings must keep Booking, Hotel and User in step. Known gaps: `totalCost` is trusted from the client, and there is no availability or date-overlap check.

**Data**: all cross-collection links (`userId`, `hotelId`, `bookingId`) are plain strings, not ObjectId refs or foreign keys. There is no migration framework.

**SPAs**: feature folders under `src/features/<domain>/` with a feature-local `api.ts` (the only place endpoint paths live), `pages/*Page.tsx` (default-exported, `React.lazy` in `app/App.tsx`), and components. TanStack Query keys come from factories in `shared/lib/query-keys.ts`, and mutations call the helpers in `shared/lib/query-invalidation.ts` (admin has its own copies). `packages/api-client/src/http.ts` is the one Axios instance (`withCredentials`, 429 and network-error retries) and `query-client.ts` sets shared defaults (4xx never retried). Web provider order is `QueryClient → Toast → Auth → Search → App`. Web routes for booking and hotel add/edit are only registered when `isLoggedIn`; `/my-hotels` and `/my-bookings` are always registered and rely on API 401s. New pages must stay within the bundle budget; add a `prefetch*Route` in `shared/lib/route-prefetch.ts` for nav-reachable pages.

**Deployment shape**: API as a Docker image whose build context must be the repo root (`apps/api/Dockerfile`; the README describes Coolify on a VPS); each SPA is its own Vercel project (`apps/*/vercel.json`) with a CSP, so any new script, frame or connect origin must be added there or it will be blocked in production.

## Git workflow

- **Never commit or push directly to `main`.** Create a branch first (`feat/...`, `fix/...`, `chore/...`, `docs/...`, `refactor/...`), push it, and open a PR into `main` with `gh pr create`. Merge only through the PR.
- Keep commits small and modular: one logical change per commit, never a single commit for unrelated work. Format: a one-line Conventional Commit subject with a scope (`feat(web): ...`), then, when the change needs explaining, a blank line and 2–3 bullets saying what changed and why.
- **No `Co-Authored-By` trailers and no "Generated with" lines** in commits or PR descriptions.
- PR descriptions: summary of behaviour and affected apps, the verification commands actually run with their results, screenshots for UI changes, and linked issues if any.
- Before opening a PR run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm check:bundle`, and report any you skipped.

## Conventions

Two-space indent, LF, double quotes, semicolons, trailing commas, 100-column Prettier. API files are `*.controller.ts`, `*.service.ts`, `*.module.ts`; request DTOs live in `dto/` next to the controller. Shared contracts belong in `packages/types`, reusable UI in `packages/ui`. New tests are colocated as `*.test.ts(x)` and must be run before being described as passing.
