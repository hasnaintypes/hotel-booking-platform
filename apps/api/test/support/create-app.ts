import { INestApplication, Type } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { sql } from "drizzle-orm";
import type { Database } from "@hotel-booking/db";
import { DATABASE } from "../../src/database/postgres.database";
import { AppModule } from "../../src/app.module";
import { ConfigService } from "@nestjs/config";
import { configureApp } from "../../src/app.setup";
import { setupSwagger } from "../../src/config/swagger.config";
import { CloudinaryService } from "../../src/integrations/cloudinary/cloudinary.service";
import { runStripeCall, StripeService } from "../../src/integrations/stripe/stripe.service";
import { MetricsService } from "../../src/common/metrics/metrics.service";
import { CLOCK, SystemClock, type Clock } from "../../src/common/clock";
import { LOG_DESTINATION } from "../../src/common/logging/logging.module";
import { createFakeCloudinary } from "./fakes";
import { createFakeStripe, type FakeStripeProvider } from "./fake-stripe";
import { FaultController } from "./fault.controller";
import { LogSink } from "./log-sink";

export type TestApp = {
  app: INestApplication;
  stripe: ReturnType<typeof createFakeStripe>;
  cloudinary: ReturnType<typeof createFakeCloudinary>;
  logs: LogSink;
  close: () => Promise<void>;
};

export type CreateTestAppOptions = {
  /** Adds the test-only controller that raises each error class. */
  faults?: boolean;
  controllers?: Type<unknown>[];
  /** Mounts the API documentation the way main.ts does. */
  docs?: boolean;
  /** Freezes the background-job clock so TTLs and staleness thresholds run without sleeping. */
  clock?: Clock;
  /**
   * Reuses a provider account, so a second application sees the effects of the first one's calls.
   * Required by tests that restart the process.
   */
  stripeProvider?: FakeStripeProvider;
  /**
   * Truncates the fixture tables on boot. Defaults to true for a test file's first application;
   * a restart passes false so the crashed process's rows are still there.
   */
  resetDatabase?: boolean;
};

/**
 * Boots the real application module with the production request pipeline
 * (`configureApp`) and external services replaced by fakes.
 */
export async function createTestApp(options: CreateTestAppOptions = {}): Promise<TestApp> {
  const stripe = createFakeStripe(options.stripeProvider);
  const cloudinary = createFakeCloudinary();

  const logs = new LogSink();
  const controllers = [
    ...(options.faults ? [FaultController] : []),
    ...(options.controllers ?? []),
  ];

  const moduleRef = await Test.createTestingModule({ imports: [AppModule], controllers })
    .overrideProvider(CLOCK)
    .useValue(options.clock ?? new SystemClock())
    .overrideProvider(StripeService)
    .useValue(stripe)
    .overrideProvider(CloudinaryService)
    .useValue(cloudinary)
    .overrideProvider(LOG_DESTINATION)
    .useValue(logs)
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({ rawBody: true });
  configureApp(app);
  if (options.docs) setupSwagger(app, app.get(ConfigService));
  await app.init();

  // The real StripeService instruments every call; the double is a plain object, so give it the
  // same instrumentation against the application's registry.
  const metrics = app.get(MetricsService);
  Object.assign(stripe, {
    call: <T>(operation: string, request: () => Promise<T>) =>
      runStripeCall(operation, request, (name, outcome, seconds) =>
        metrics.recordStripeCall(name, outcome, seconds),
      ),
  });

  if (options.resetDatabase !== false) {
    // Each test file starts from a clean PostgreSQL identity state. Files run in sequence.
    // Truncating users cascades into booking tables, whose append-only trigger is not wanted here.
    await app.get<Database>(DATABASE).transaction(async (tx) => {
      await tx.execute(sql`set local session_replication_role = replica`);
      await tx.execute(sql`truncate table "users" cascade`);
      await tx.execute(sql`truncate table "analytics_snapshots"`);
      await tx.execute(sql`truncate table "idempotency_keys"`);
    });
  }

  return {
    app,
    stripe,
    cloudinary,
    logs,
    close: async () => {
      await app.close();
    },
  };
}
