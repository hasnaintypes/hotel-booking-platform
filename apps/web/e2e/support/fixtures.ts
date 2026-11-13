import { expect, test as base } from "@playwright/test";
import { stripeMockOrigin } from "./env";
import { fakeStripeJs } from "./fake-stripe-js";

/**
 * Serves the local Stripe.js stub wherever the real script would load. It is an auto fixture so
 * every test (and every page in the context) gets it before the first navigation; the app's
 * `loadStripe` call then finds `window.Stripe` already defined.
 */
export const test = base.extend<{ stripeJs: void }>({
  stripeJs: [
    async ({ context }, use) => {
      await context.route("https://js.stripe.com/**", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/javascript",
          body: fakeStripeJs(stripeMockOrigin),
        }),
      );
      await use();
    },
    { auto: true },
  ],
});

export { expect };
