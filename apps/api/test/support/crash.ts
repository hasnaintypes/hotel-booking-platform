import type { Clock } from "../../src/common/clock";
import { createTestApp, type CreateTestAppOptions, type TestApp } from "./create-app";
import type { FakeStripeProvider } from "./fake-stripe";

/**
 * Models a worker being killed mid-step.
 *
 * The old process goes away with a provider call still in flight, so no `catch`, `finally` or
 * claim release runs; everything that already committed stays in PostgreSQL, and provider state
 * stays in the shared fake account. The caller starts the work, waits for the provider call to be
 * entered (see `hangNextStripeCall`), then calls this.
 */
export async function killProcess(t: TestApp): Promise<void> {
  await t.close();
}

/**
 * Boots a replacement process against the same database and the same provider account. Database
 * fixtures are preserved, because a real restart does not recreate them.
 */
export function restartProcess(options: {
  provider: FakeStripeProvider;
  clock?: Clock;
  extra?: Omit<CreateTestAppOptions, "stripeProvider" | "clock" | "resetDatabase">;
}): Promise<TestApp> {
  return createTestApp({
    ...options.extra,
    stripeProvider: options.provider,
    resetDatabase: false,
    ...(options.clock ? { clock: options.clock } : {}),
  });
}
