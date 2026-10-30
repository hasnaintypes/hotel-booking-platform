# Hotel Booking Management System — React + NestJS Full-Stack TypeScript Project

[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248)](https://www.mongodb.com/)
[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E)](https://nestjs.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-blue)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38B2AC)](https://tailwindcss.com/)
[![Stripe](https://img.shields.io/badge/Stripe-Payments-635BFF)](https://stripe.com/)

A production-style **hotel booking platform** for learning full-stack TypeScript: guests search and book with **Stripe**, owners manage hotels with **Cloudinary** images, and everyone can explore a **Business Insights** dashboard. Built as a **TypeScript** monorepo (MongoDB · NestJS · React) with a Vite SPA frontend.

![Screenshot 2025-09-04 at 12 02 23](https://github.com/user-attachments/assets/7b87581f-8a1a-4de4-99c3-ba5fab14f20d)
![Screenshot 2025-09-04 at 12 03 00](https://github.com/user-attachments/assets/76e284bb-4324-4798-8e87-0079aab65a57)
![Screenshot 2025-09-04 at 12 03 48](https://github.com/user-attachments/assets/c35d0786-f80d-493e-815c-7a594253183c)
![Screenshot 2025-09-04 at 12 04 14](https://github.com/user-attachments/assets/d02e0687-8bd6-4924-8b07-9311c0308e11)
![Screenshot 2025-09-04 at 12 04 37](https://github.com/user-attachments/assets/2adc94fe-7bd8-4622-9d7e-2342ef5a7bd5)
![Screenshot 2025-09-04 at 12 05 31](https://github.com/user-attachments/assets/34fd12ca-9c3e-4242-960d-dfdfe5447299)
![Screenshot 2025-09-04 at 12 05 59](https://github.com/user-attachments/assets/ff330293-fe8e-487f-a73a-1a1c4ade0fc1)
![Screenshot 2025-09-04 at 12 06 36](https://github.com/user-attachments/assets/7b8c1b80-e395-4d46-b9f7-2b93211612eb)
![Screenshot 2025-09-04 at 12 07 06](https://github.com/user-attachments/assets/1b15e2b6-5ad0-42a7-b121-c54d9ddf623a)
![Screenshot 2025-09-04 at 12 07 24](https://github.com/user-attachments/assets/09e10d64-9c1d-4f0f-a167-a92d18caa85e)
![Screenshot 2025-09-04 at 12 07 44](https://github.com/user-attachments/assets/9cb2e884-759e-4545-a963-11df51aa9785)
![Screenshot 2025-09-04 at 12 08 32](https://github.com/user-attachments/assets/e89dd5df-c14f-4304-a012-9f3d35417182)
![Screenshot 2025-09-04 at 12 09 52](https://github.com/user-attachments/assets/a4729503-28f4-489e-bc8f-d5a3e3bea93a)
![Screenshot 2025-09-04 at 12 10 04](https://github.com/user-attachments/assets/68552511-83ac-42fa-8f54-99c926e3015d)
![Screenshot 2025-09-04 at 12 10 20](https://github.com/user-attachments/assets/a5d236d7-3a07-493d-b966-afdafa83b383)
![Screenshot 2025-09-04 at 12 10 33](https://github.com/user-attachments/assets/539c4d39-ca89-4383-9abd-1fa3dc184e50)

## Table of contents

- [What you will learn](#what-you-will-learn)
- [Features](#features)
- [Tech stack & keywords](#tech-stack--keywords)
- [Architecture overview](#architecture-overview)
- [Monorepo structure](#monorepo-structure)
- [Prerequisites](#prerequisites)
- [Environment variables (.env)](#environment-variables-env)
- [How to run locally](#how-to-run-locally)
- [Frontend walkthrough](#frontend-walkthrough)
- [Backend walkthrough](#backend-walkthrough)
- [API reference](#api-reference)
- [Authentication flow](#authentication-flow)
- [Booking & Stripe flow](#booking--stripe-flow)
- [Components & reuse guide](#components--reuse-guide)
- [Shared types](#shared-types)
- [Deployment](#-deployment)
- [Learning path (suggested)](#learning-path-suggested)
- [Troubleshooting](#troubleshooting)
- [Keywords](#keywords)
- [Conclusion](#conclusion)
- [Happy Coding!](#happy-coding-)

---

## What you will learn

This repository is designed as a **teaching project**. By reading and running it you practice:

| Topic                                     | Where it shows up                          |
| ----------------------------------------- | ------------------------------------------ |
| REST API design with NestJS + TypeScript  | `apps/api/src/modules/`                    |
| JWT auth + optional Google OAuth          | `modules/auth/`, `common/guards/`          |
| Mongoose schemas + Nest DI                | `modules/*/schemas/`, `database/`          |
| React SPA routing & layouts               | `app/App.tsx`, `shared/components/layout/` |
| Feature modules + React Query             | `features/*/api.ts`, `features/*/context/` |
| File uploads → Cloudinary                 | `modules/my-hotels/`                       |
| Card payments with Stripe PaymentIntents  | booking routes + `BookingForm`             |
| Tailwind + shadcn/ui-style primitives     | `shared/components/ui/`                    |
| Monorepo shared contracts                 | `packages/types/src/index.ts`              |
| Docker / Coolify + Vercel deploy          | `apps/api/Dockerfile`, `apps/web/vercel.json` |

---

## Features

### For guests (travelers)

- Browse featured hotels on the home page
- Search by destination, dates, guests, price, stars, types, facilities
- Open hotel detail pages with images and amenities
- Register / sign in (email+password or Google)
- Book rooms with Stripe card payment (GBP)
- View **My Bookings**

### For hotel owners

- Add / edit hotels (multipart form, up to 6 images)
- List **My Hotels** and inspect booking logs per property
- Track revenue-related totals stored on hotel/user documents

### For learners / operators

- Interactive **Swagger** API docs (`/api-docs`)
- **API status** health UI (`/api-status`)
- **Business Insights** dashboard (`/business-insights`) with Recharts
- Rate limiting, Helmet, compression, and Pino logging on the API

> **Note:** `Review` and `Analytics` Mongoose models exist for future work; live insights currently aggregate from `Hotel`, `User`, and `Booking`.

---

## Tech stack & keywords

### Stack (MERN + friends)

| Layer         | Technology                                         | Role (beginner view)                        |
| ------------- | -------------------------------------------------- | ------------------------------------------- |
| Database      | **MongoDB** + **Mongoose**                         | Stores users, hotels, bookings as documents |
| API           | **Node.js** + **NestJS 11**                        | HTTP server; modules + controllers           |
| UI            | **React 19** + **Vite 8**                          | SPA — fast HMR in development               |
| Language      | **TypeScript**                                     | Types catch bugs before runtime             |
| Styling       | **Tailwind CSS** + **Radix / shadcn-style UI**     | Utility CSS + accessible primitives         |
| Data fetching | **React Query (v5)** + **Axios**                   | Cache server data; attach JWT               |
| Auth          | **JWT** + **bcryptjs** + optional **Google OAuth** | Stateless login; hashed passwords           |
| Payments      | **Stripe**                                         | PaymentIntents; confirm then create booking |
| Media         | **Cloudinary** + **multer**                        | Image CDN after upload                      |
| Charts        | **Recharts**                                       | Business insights graphs                    |

### Keyword cheat-sheet

- **JWT (JSON Web Token):** signed string proving “this user is logged in.” Frontend stores it in `localStorage.session_id` and sends `Authorization: Bearer …`.
- **CORS:** browser rule; API must allow your frontend origin (`FRONTEND_URL`, Vercel, etc.).
- **PaymentIntent:** Stripe object that represents a payment attempt; booking is created only if status is `succeeded`.
- **React Query key:** string/array identity for a cached request (e.g. `validateToken`). Invalidate after login/logout.
- **SPA rewrite:** host (Vercel) serves `index.html` for all routes so `/search` works on refresh.

---

## Architecture overview

```text
Browser (React SPA :5174)
        │  HTTPS JSON + JWT Bearer
        ▼
NestJS API (:5001)
        ├── MongoDB Atlas
        ├── Stripe
        ├── Cloudinary
        └── Google OAuth (optional)
```

**Typical request path**

1. React page calls a function in its feature's `api.ts`
2. Axios (`shared/api/client.ts`) adds the Bearer token
3. Nest controller (+ optional `JwtAuthGuard`) runs
4. Mongoose reads/writes MongoDB
5. JSON returns → React Query caches / invalidates

---

## Monorepo structure

```text
hotel-booking-platform/
├── apps/
│   ├── api/                   # NestJS API (@hotel-booking/api)
│   │   ├── src/
│   │   │   ├── main.ts        # bootstrap, middleware, Swagger
│   │   │   ├── app.module.ts  # root module wiring
│   │   │   ├── config/        # typed config, env validation, Swagger
│   │   │   ├── common/        # guards, decorators, exception filter
│   │   │   ├── database/      # global Mongoose wiring + seed
│   │   │   ├── integrations/  # Stripe, Cloudinary, LLM providers
│   │   │   └── modules/       # auth, users, hotels, bookings, reviews…
│   │   ├── Dockerfile
│   │   └── .env.example
│   └── web/                   # Vite React SPA (@hotel-booking/web)
│       ├── src/
│       │   ├── main.tsx       # providers
│       │   ├── app/           # router + query client
│       │   ├── features/      # auth, hotels, bookings, admin, analytics…
│       │   ├── shared/        # api, ui, layout, hooks, lib
│       │   ├── config/
│       │   └── styles/
│       ├── vercel.json
│       └── .env.example
├── packages/
│   └── types/                 # @hotel-booking/types (shared contracts)
│       └── src/index.ts
├── .github/workflows/ci.yml
├── docker-compose.yml         # local MongoDB
├── package.json               # workspace scripts
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
└── README.md
```

---

## Prerequisites

- **Node.js** 22+ and [pnpm](https://pnpm.io/) 10 (`corepack enable`)
- **MongoDB** — local (`docker compose up -d mongo`) or free [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) cluster
- (Recommended) **Stripe** test keys, **Cloudinary** free account
- (Optional) **Google Cloud** OAuth client for “Continue with Google”

---

## Environment variables (.env)

### Do you need a `.env`?

| Package      | Required to start?  | Notes                                                                                            |
| ------------ | ------------------- | ------------------------------------------------------------------------------------------------ |
| **Backend**  | **Yes**             | App **exits** if required vars are missing (`config/env.validation.ts` fail-fast). Copy `.env.example` → `.env`. |
| **Frontend** | **Mostly optional** | SPA boots without a file, but set `.env` so API + Stripe point to the right places.              |

Never commit real `.env` files (they are gitignored). Examples are safe templates.

---

### Backend — `apps/api/.env`

Copy:

```bash
cd apps/api
cp .env.example .env
```

#### Required (server will not start without these)

| Variable                    | What it is            | How to get it                                                                      |
| --------------------------- | --------------------- | ---------------------------------------------------------------------------------- |
| `MONGODB_CONNECTION_STRING` | Mongo connection URI  | Atlas → Connect → Drivers → copy URI; replace password                             |
| `JWT_SECRET_KEY`            | Secret to sign JWTs   | `openssl rand -base64 64` (long random string)                                     |
| `CLOUDINARY_CLOUD_NAME`     | Cloudinary cloud name | [cloudinary.com](https://cloudinary.com) dashboard                                 |
| `CLOUDINARY_API_KEY`        | Cloudinary API key    | same dashboard                                                                     |
| `CLOUDINARY_API_SECRET`     | Cloudinary API secret | same dashboard                                                                     |
| `STRIPE_API_KEY`            | Stripe **secret** key | [dashboard.stripe.com/apikeys](https://dashboard.stripe.com/apikeys) → `sk_test_…` |

#### Strongly recommended / optional

| Variable        | Purpose                                     | Local example                                     |
| --------------- | ------------------------------------------- | ------------------------------------------------- |
| `PORT`          | API port                                    | `5001` (macOS often blocks `5000` via AirPlay)    |
| `NODE_ENV`      | `development` / `production`                | `development`                                     |
| `FRONTEND_URL`  | CORS + OAuth redirects                      | `http://localhost:5174`                           |
| `BACKEND_URL`   | Public API origin for Google `redirect_uri` | local: omit (defaults to `http://localhost:PORT`) |
| `GOOGLE_ID`     | Google OAuth client id                      | Google Cloud Console → Credentials                |
| `GOOGLE_SECRET` | Google OAuth client secret                  | same                                              |

**Google redirect URI to register** (when using Google sign-in locally):

```text
http://localhost:5001/api/auth/callback/google
```

Production example: `{BACKEND_URL}/api/auth/callback/google`

---

### Frontend — `apps/web/.env`

Copy:

```bash
cd apps/web
cp .env.example .env
```

| Variable              | Required?           | Purpose                                                       |
| --------------------- | ------------------- | ------------------------------------------------------------- |
| `VITE_API_BASE_URL`   | Recommended locally | Backend origin, e.g. `http://localhost:5001`                  |
| `VITE_STRIPE_PUB_KEY` | For payments        | Stripe **publishable** key `pk_test_…` (used in `AppContext`) |

> Vite only exposes variables prefixed with `VITE_` to the browser. Never put secret keys (`sk_…`, Mongo URI, JWT secret) in frontend env.

If `VITE_API_BASE_URL` is unset, `getApiBaseUrl()` falls back to `http://localhost:5001`. Set `VITE_API_BASE_URL` in deployed environments.

---

### Minimal “happy path” checklist

1. Atlas DB created → paste URI into backend `.env`
2. Generate `JWT_SECRET_KEY`
3. Create Cloudinary + Stripe test accounts → paste keys
4. Frontend: `VITE_API_BASE_URL=http://localhost:5001` and `VITE_STRIPE_PUB_KEY=pk_test_…`
5. Start backend, then frontend

You can explore UI/API docs without Google OAuth. You need Stripe keys for real booking payments.

---

## How to run locally

Install once from the repo root, then use **two terminals** (or `pnpm dev` for both).

```bash
pnpm install
```

### 1) Backend

```bash
cd apps/api
cp .env.example .env   # then edit values
pnpm dev               # → http://localhost:5001
```

Smoke checks:

- Health: `http://localhost:5001/api/health`
- Swagger: `http://localhost:5001/api-docs`

### Demo data seed (Mongoose — wipes local DB)

```bash
pnpm --filter @hotel-booking/api seed   # destroys User/Hotel/Booking/Review/Analytics then reseeds
```

Login after seed: `test@user.com` / `12345678` (**admin** — opens `/admin`). Also: `owner@hotel.com`, `guest@user.com` (same password). This stack uses **MongoDB + Mongoose**, not Prisma.

Optional AI assist (draft-and-approve only): set `AI_ASSIST_ENABLED=true` in backend `.env` (optional `OPENAI_API_KEY`; stub drafts when unset).

### 2) Frontend

```bash
cd apps/web
cp .env.example .env   # edit VITE_* as needed
pnpm dev               # → http://localhost:5174
```

### Build verification

From the repository root:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

---

## Frontend walkthrough

### Bootstrap (`main.tsx`)

```text
QueryClientProvider
  └── AppContextProvider      (auth, Stripe, toasts, global loading)
        └── SearchContextProvider   (search criteria → sessionStorage)
              └── App (React Router)
```

**React Query** caches API responses. After login/logout the app invalidates the `validateToken` query so `isLoggedIn` updates.

### Routes (`App.tsx`)

| Path                                 | Page               | Notes                          |
| ------------------------------------ | ------------------ | ------------------------------ |
| `/`                                  | Home               | Featured hotels                |
| `/search`                            | Search             | Filters + pagination           |
| `/detail/:hotelId`                   | Detail             | Public                         |
| `/business-insights`                 | AnalyticsDashboard | Charts                         |
| `/api-docs`, `/api-status`           | Docs / health UI   | Public                         |
| `/register`, `/sign-in`              | Auth forms         | `AuthLayout`                   |
| `/auth/callback`                     | OAuth return       | Writes token to `localStorage` |
| `/my-bookings`, `/my-hotels`         | Lists              | API still needs JWT            |
| `/hotel/:hotelId/booking`            | Booking            | UI requires login              |
| `/add-hotel`, `/edit-hotel/:hotelId` | Owner forms        | UI requires login              |

Layouts: `Layout` (chrome) · `AuthLayout` (centered auth).

### API client layers

| File                          | Job                                                        |
| ----------------------------- | ---------------------------------------------------------- |
| `shared/api/client.ts`        | Axios instance, base URL, Bearer interceptor, 401 cleanup  |
| `features/auth/api.ts`        | `signIn`, `register`, `validateToken`, `signOut`           |
| `features/hotels/api.ts`      | `searchHotels`, `fetchHotels`, `fetchHotelById`            |
| `features/bookings/api.ts`    | `createPaymentIntent`, `createRoomBooking`, `cancelBooking`|
| `features/admin/api.ts`       | admin users/bookings/reviews + hotel visibility            |
| `features/analytics/api.ts`   | business-insights + rollups                                |

Example pattern you can reuse in other projects:

```ts
// Conceptual — see real helpers in features/*/api.ts
export const fetchMyHotels = async () => {
  const response = await apiClient.get("/api/my-hotels");
  return response.data;
};
```

---

## Backend walkthrough

### Boot sequence (`src/main.ts` + `src/app.module.ts`)

1. `ConfigModule.forRoot` loads `.env`, validates required variables, and exposes typed config
2. `NestFactory.create(AppModule)` builds the dependency graph (global Mongoose, JWT, throttler, feature modules)
3. Global middleware runs: Helmet, compression, cookie parser, CORS allowlist, JSON body parsing, Pino HTTP logging
4. Global `ValidationPipe` validates DTOs and strips unknown fields
5. `AllExceptionsFilter` keeps the legacy `{ message }` error shape
6. Swagger is mounted at `/api-docs`; the app listens on `PORT` (default **5001**)

### Request pipeline highlights

- **`helmet`** — security headers
- **`@nestjs/throttler`** — global rate limit; stricter limit on the payment-intent route
- **CORS** — allows `FRONTEND_URL`, localhost Vite ports, `*.vercel.app`, `*.netlify.app`
- **`JwtAuthGuard`** — reads Bearer token first, then the `session_id` cookie
- **`RolesGuard` + `@Roles(...)`** — role checks for admin/owner routes
- **`ValidationPipe`** — `whitelist`, `transform`, implicit conversion

### Data models

| Model              | File                                            | Idea                                        |
| ------------------ | ----------------------------------------------- | ------------------------------------------- |
| User               | `modules/users/schemas/user.schema.ts`          | email, hashed password, profile, totals     |
| Hotel              | `modules/hotels/schemas/hotel.schema.ts`        | owner `userId`, pricing, images, policies   |
| Booking            | `modules/bookings/schemas/booking.schema.ts`    | separate collection (not embedded in Hotel) |
| Review / Analytics | `modules/reviews|analytics/schemas/*.schema.ts` | reviews + rollup snapshots                  |

---

## API reference

Base URL local: `http://localhost:5001`

### Auth — `/api/auth`

| Method | Path               | Auth | Description                                |
| ------ | ------------------ | ---- | ------------------------------------------ |
| GET    | `/google`          | —    | Start Google OAuth                         |
| GET    | `/callback/google` | —    | OAuth callback → redirect frontend + token |
| POST   | `/login`           | —    | Email/password → JWT                       |
| GET    | `/validate-token`  | JWT  | `{ userId }`                               |
| POST   | `/logout`          | —    | Clear session cookie                       |

### Users — `/api/users`

| Method | Path        | Auth | Description     |
| ------ | ----------- | ---- | --------------- |
| POST   | `/register` | —    | Create user     |
| GET    | `/me`       | JWT  | Current profile |

### Hotels — `/api/hotels`

| Method | Path                                | Auth | Description                        |
| ------ | ----------------------------------- | ---- | ---------------------------------- |
| GET    | `/`                                 | —    | All hotels                         |
| GET    | `/search`                           | —    | Filters + pagination (page size 5) |
| GET    | `/:id`                              | —    | Hotel by id                        |
| POST   | `/:hotelId/bookings/payment-intent` | JWT  | Stripe PaymentIntent               |
| POST   | `/:hotelId/bookings`                | JWT  | Confirm booking after payment      |

**Search query params:** `destination`, `adultCount`, `childCount`, `facilities[]`, `types[]`, `stars[]`, `maxPrice`, `sortOption`, `page`

### My hotels — `/api/my-hotels`

| Method | Path        | Auth | Description                  |
| ------ | ----------- | ---- | ---------------------------- |
| POST   | `/`         | JWT  | Create + images (Cloudinary) |
| GET    | `/`         | JWT  | Owner list                   |
| GET    | `/:id`      | JWT  | One owned hotel              |
| PUT    | `/:hotelId` | JWT  | Update                       |

### My bookings — `/api/my-bookings`

| Method | Path | Auth | Description                      |
| ------ | ---- | ---- | -------------------------------- |
| GET    | `/`  | JWT  | Guest bookings (hotel populated) |

### Bookings management — `/api/bookings`

| Method | Path              | Auth | Description                      |
| ------ | ----------------- | ---- | -------------------------------- |
| GET    | `/`               | JWT  | List                             |
| GET    | `/hotel/:hotelId` | JWT  | By hotel                         |
| GET    | `/:id`            | JWT  | By id                            |
| PATCH  | `/:id/status`     | JWT  | Status                           |
| PATCH  | `/:id/payment`    | JWT  | Payment status                   |
| DELETE | `/:id`            | JWT  | Delete + adjust analytics fields |

### Health — `/api/health`

| Method | Path        | Description                                                      |
| ------ | ----------- | ---------------------------------------------------------------- |
| GET    | `/`         | Public liveness (`status`, `timestamp`, `database.status` only)  |
| GET    | `/detailed` | JWT — rounded memory MB + uptime (no host/PID/Node)              |

### Business insights — `/api/business-insights`

| Method | Path                                     | Auth    | Description  |
| ------ | ---------------------------------------- | ------- | ------------ |
| GET    | `/dashboard` · `/dashboard/public`       | JWT / — | Metrics      |
| GET    | `/forecast` · `/forecast/public`         | JWT / — | Forecast     |
| GET    | `/system-stats` · `/system-stats/public` | JWT / — | System stats |

Interactive docs: **`/api-docs`** (Swagger UI).

---

## Authentication flow

### Email / password

1. `POST /api/auth/login` with `{ email, password }`
2. Backend verifies with **bcrypt**, returns JWT
3. Frontend stores `localStorage.session_id` (+ user fields)
4. Axios sends Bearer token on later calls
5. `GET /api/auth/validate-token` drives `isLoggedIn`

### Google OAuth

1. Browser goes to `{API}/api/auth/google`
2. Google → `{BACKEND}/api/auth/callback/google`
3. Backend creates/finds user, redirects to `{FRONTEND}/auth/callback?token=…`
4. `AuthCallback` saves token and invalidates React Query

### Logout

`POST /api/auth/logout` + clear `localStorage` + invalidate `validateToken`.

---

## Booking & Stripe flow

```text
Detail → /hotel/:id/booking
   → POST .../payment-intent  (server creates PaymentIntent, GBP)
   → BookingForm: stripe.confirmCardPayment(clientSecret)
   → POST .../bookings        (only if PaymentIntent succeeded)
   → /my-bookings
```

Amount ≈ `pricePerNight × nights × 100` (pence). Use Stripe **test cards** in development.

---

## Components & reuse guide

### High-value UI pieces

| Component                                      | Path                     | Reuse idea                                              |
| ---------------------------------------------- | ------------------------ | ------------------------------------------------------- |
| `SearchBar` / `AdvancedSearch`                 | `components/`            | Copy pattern: form → context → navigate with query      |
| Filters (`PriceFilter`, `StarRatingFilter`, …) | `components/`            | Controlled checkboxes/sliders → parent search params    |
| `SearchResultsCard`                            | `components/`            | Presentational card: props in, Link out                 |
| `Pagination`                                   | `components/`            | Page number UI for any list API                         |
| `MainNav` / `MobileNav`                        | `components/`            | Auth-aware nav; swap brand links                        |
| `ManageHotelForm` sections                     | `forms/ManageHotelForm/` | Multi-section RHF form + file input                     |
| `BookingForm`                                  | `forms/BookingForm/`     | Stripe Elements wrapper pattern                         |
| `ui/*` (Button, Dialog, …)                     | `components/ui/`         | shadcn-style primitives — drop into other Tailwind apps |

### Contexts you can port

**AppContext** — “am I logged in?”, toasts, Stripe promise, global loading spinner.  
**SearchContext** — persist search criteria in `sessionStorage` so detail/booking keep dates/guests.

### Example: attaching JWT (portable)

```ts
// lib/api-client.ts (simplified idea)
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("session_id");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

Use the same pattern in any Axios/React project.

### Example: invalidate after auth

```ts
queryClient.invalidateQueries("validateToken");
queryClient.refetchQueries("validateToken");
```

---

## Shared types

`@hotel-booking/types` (`packages/types/src/index.ts`) exports `UserType`, `HotelType`, `BookingType`, search/payment response shapes.

**Why it matters:** frontend and backend stay aligned. Both apps consume the workspace package.

```ts
import { HotelType } from "@hotel-booking/types";
```

---

## Deployment

---

### Backend Deployment (Coolify on VPS)

1. Build from the **repo root** context (see `apps/api/Dockerfile`).
2. Set **all required** backend env vars in Coolify (same names as `apps/api/.env.example`).
3. Set `FRONTEND_URL` to your Vercel URL; set `BACKEND_URL` to the public API origin.
4. Expose `PORT` as configured in Coolify; health check: `GET /api/health`.
5. Redeploy when `main` changes.

```bash
pnpm --filter @hotel-booking/api build
```

---

### Frontend Deployment (Netlify/Vercel)

- Config: `apps/web/vercel.json` (SPA rewrite → `index.html`); set the Vercel project root to `apps/web`.
- Build: `pnpm --filter @hotel-booking/web build` → `apps/web/dist/`
- Env in host dashboard:
  - `VITE_API_BASE_URL` = production API origin
  - `VITE_STRIPE_PUB_KEY` = live or test publishable key

```bash
pnpm --filter @hotel-booking/web build
```

### Production checklist

- [ ] Secrets only in host dashboards (never in git)
- [ ] CORS / `FRONTEND_URL` match the live SPA
- [ ] Google OAuth redirect URIs match production `BACKEND_URL`
- [ ] Stripe keys match mode (test vs live)
- [ ] SSL + health endpoint OK

---

## Learning path (suggested)

1. Run backend health + open Swagger
2. Register a user, call `/api/users/me` with Bearer token
3. Trace `Search` page → `GET /api/hotels/search`
4. Add a hotel (watch Cloudinary URLs appear)
5. Complete one Stripe **test** booking
6. Read React Query invalidation on login/logout

---

## Troubleshooting

| Symptom                         | Likely fix                                                               |
| ------------------------------- | ------------------------------------------------------------------------ |
| Backend exits immediately       | Missing required env var — check console list                            |
| Frontend calls wrong host       | Set `VITE_API_BASE_URL=http://localhost:5001`                            |
| CORS errors                     | Set backend `FRONTEND_URL=http://localhost:5174`                         |
| Port in use / weird 5000 issues | Use `PORT=5001`                                                          |
| Google OAuth fails              | Register exact callback URI; set `BACKEND_URL` / `FRONTEND_URL`          |
| Payments fail                   | Matching `sk_test` + `pk_test`; Booking page needs `VITE_STRIPE_PUB_KEY` |
| Images fail on create hotel     | Cloudinary trio in backend `.env`                                        |

---

## Keywords

`MERN` · `MongoDB` · `NestJS` · `React` · `Node.js` · `TypeScript` · `Vite` · `Tailwind CSS` · `React Query` · `Axios` · `JWT` · `OAuth` · `bcrypt` · `Stripe PaymentIntent` · `Cloudinary` · `multer` · `Mongoose` · `Swagger` · `Helmet` · `rate limiting` · `Pino` · `class-validator` · `Recharts` · `Vercel` · `Coolify` · `Docker` · `hotel booking` · `full-stack` · `open source`

---

## Conclusion

This project is a complete, production-flavored **hotel booking** codebase you can study end-to-end: typed API, JWT auth, media uploads, payments, analytics UI, and real deploy paths. Start with the env templates, run both apps locally, then follow one user journey (search → book) while reading the matching route and page files. Reuse the API-client, auth interceptor, form sections, and UI primitives in your own TypeScript React projects.

---

## Happy Coding

This is an **open-source project** — feel free to use, enhance, and extend this project further!
