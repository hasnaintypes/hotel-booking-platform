# @hotel-booking/web

Guest and hotel-owner single-page app (React 19, Vite 8, TypeScript, Tailwind CSS 4, TanStack
Query 5, React Router 7). It talks to the API in `apps/api` over `/api/*` using the shared Axios
instance from `@hotel-booking/api-client`.

See the [root README](../../README.md) for the monorepo overview, setup, environment variables and
deployment. This file only covers what is specific to this app.

## Running

From the repository root:

```bash
pnpm --filter @hotel-booking/web dev       # http://localhost:5174
pnpm --filter @hotel-booking/web build     # tsc && vite build
pnpm --filter @hotel-booking/web test      # vitest
pnpm --filter @hotel-booking/web lint
pnpm --filter @hotel-booking/web typecheck
```

Copy `.env.example` to `.env` first. The app reads `VITE_API_BASE_URL`, `VITE_STRIPE_PUB_KEY` and
`VITE_ADMIN_URL`; only `VITE_`-prefixed values reach the browser, so never put secrets here.

## Structure

```text
src/
├── app/              # App shell and route table (React.lazy pages)
├── features/<domain>/ # auth, hotels, bookings, hotel-management, reviews, analytics, status
│   ├── api.ts        # the only place endpoint paths live
│   ├── pages/*Page.tsx
│   ├── components/
│   └── lib/
├── shared/           # layout, context, query keys/invalidation, small helpers
└── test/             # Vitest setup
```

- Pages are default-exported and lazy-loaded; nav-reachable pages add a `prefetch*Route` in
  `shared/lib/route-prefetch.ts`.
- Query keys come from `shared/lib/query-keys.ts`; mutations call `shared/lib/query-invalidation.ts`.
- Booking and hotel add/edit routes are registered only when the local `auth_session=1` flag is set;
  the SPAs hold no credential, only an httpOnly cookie set by the API.
- Shared contracts live in `packages/types`, reusable UI in `packages/ui`.

## Notes

- The entry bundle is budgeted by `pnpm check:bundle` after a build; keep new pages code-split.
- Security headers and the Content-Security-Policy are set in `vercel.json`. Any new script, frame
  or connect origin must be added there or it will be blocked in production.
- Payments are not production-ready until milestone M2; use Stripe test keys.
