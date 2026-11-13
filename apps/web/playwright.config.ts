import { defineConfig, devices } from "@playwright/test";
import { E2E, apiOrigin, stripeMockOrigin } from "./e2e/support/env";

/**
 * Playwright runs the real API and the production web build against a disposable PostgreSQL
 * database. Stripe is replaced end to end: `stripe-mock.mjs` answers the API's SDK calls and
 * signs the webhook, and the browser receives a stubbed Stripe.js from the fixture in
 * `e2e/support/fixtures.ts`. Nothing leaves the machine and no Stripe account is needed.
 */
export default defineConfig({
  testDir: "./e2e",
  // The suite shares one database and one mock, and books real rows; parallel workers would make
  // the "exactly one booking" assertions race each other.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${E2E.webPort}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: [
    {
      command: "node e2e/support/stripe-mock.mjs",
      url: `${stripeMockOrigin}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: {
        E2E_STRIPE_MOCK_PORT: String(E2E.stripeMockPort),
        E2E_STRIPE_WEBHOOK_SECRET: E2E.webhookSecret,
        E2E_API_PORT: String(E2E.apiPort),
      },
    },
    {
      command: "pnpm --filter @hotel-booking/api dev",
      url: `${apiOrigin}/health/live`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        NODE_ENV: "development",
        PORT: String(E2E.apiPort),
        DATABASE_URL: E2E.databaseUrl,
        FRONTEND_URL: `http://localhost:${E2E.webPort}`,
        // Dummy values: the API refuses to start without them, but the suite never uploads.
        JWT_SECRET_KEY: "e2e-jwt-secret-key-not-for-production",
        CLOUDINARY_CLOUD_NAME: "e2e",
        CLOUDINARY_API_KEY: "e2e",
        CLOUDINARY_API_SECRET: "e2e",
        // The API's Stripe SDK talks to the local mock instead of api.stripe.com.
        STRIPE_API_KEY: "sk_test_e2e_playwright_mock",
        STRIPE_WEBHOOK_SECRET: E2E.webhookSecret,
        STRIPE_API_BASE: stripeMockOrigin,
        // Keep the API's own output quiet; the mock and Vitest already log what matters.
        LOG_LEVEL: "warn",
        // The worker would reconcile/capture outside a test and call the mock unpredictably.
        RUN_WORKER: "false",
      },
    },
    {
      // A production build, not the dev server: the checkout, routing and env inlining are what
      // the milestone gate is about.
      command:
        "pnpm --filter @hotel-booking/web build && " +
        `pnpm --filter @hotel-booking/web exec vite preview --port ${E2E.webPort} --strictPort --host 127.0.0.1`,
      url: `http://localhost:${E2E.webPort}`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        VITE_API_BASE_URL: apiOrigin,
        // The value only has to look like a publishable key; stripePromise is stubbed per page.
        VITE_STRIPE_PUB_KEY: "pk_test_e2e_playwright_mock",
        VITE_ADMIN_URL: `http://localhost:5175`,
      },
    },
  ],
});
