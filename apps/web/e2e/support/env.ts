/**
 * One place for the ports, credentials and disposable database the Playwright suite uses.
 * `playwright.config.ts` starts every service from these values, and the specs assert against
 * them, so a changed port or database only has to be edited here.
 *
 * The values are intentionally local-only. `STRIPE_API_BASE` points the API's Stripe SDK at
 * `stripe-mock.mjs`, and the suite never talks to Stripe.
 */
const port = (name: string, fallback: number): number => {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const E2E = {
  webPort: port("E2E_WEB_PORT", 5174),
  apiPort: port("E2E_API_PORT", 5001),
  stripeMockPort: port("E2E_STRIPE_MOCK_PORT", 12111),

  /** Seeded guest from packages/db/src/seed/fixtures.ts. */
  guestEmail: "guest@user.com",
  guestFirstName: "Guest",
  guestLastName: "Traveler",
  hotelName: "Thames View Boutique",
  hotelCity: "London",

  /** Disposable database; reset, migrated and seeded by `prepare-db.mjs` before every run. */
  databaseUrl:
    process.env.E2E_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/hotel_booking_e2e",
  /** Must be at least 12 characters (packages/db/src/seed/guard.ts). */
  seedPassword: process.env.E2E_SEED_PASSWORD ?? "e2e-playwright-password",
  /** Shared by stripe-mock.mjs and the API; never a real Stripe signing secret. */
  webhookSecret: process.env.E2E_STRIPE_WEBHOOK_SECRET ?? "whsec_e2e_playwright_mock",
} as const;

export const stripeMockOrigin = `http://localhost:${E2E.stripeMockPort}`;
export const apiOrigin = `http://localhost:${E2E.apiPort}`;
export const apiWebhookUrl = `${apiOrigin}/webhooks/stripe`;
