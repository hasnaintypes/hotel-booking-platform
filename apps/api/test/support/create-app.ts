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
import { StripeService } from "../../src/integrations/stripe/stripe.service";
import { LOG_DESTINATION } from "../../src/common/logging/logging.module";
import { createFakeCloudinary, createFakeStripe } from "./fakes";
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
};

/**
 * Boots the real application module with the production request pipeline
 * (`configureApp`) and external services replaced by fakes.
 */
export async function createTestApp(options: CreateTestAppOptions = {}): Promise<TestApp> {
  const stripe = createFakeStripe();
  const cloudinary = createFakeCloudinary();

  const logs = new LogSink();
  const controllers = [
    ...(options.faults ? [FaultController] : []),
    ...(options.controllers ?? []),
  ];

  const moduleRef = await Test.createTestingModule({ imports: [AppModule], controllers })
    .overrideProvider(StripeService)
    .useValue(stripe)
    .overrideProvider(CloudinaryService)
    .useValue(cloudinary)
    .overrideProvider(LOG_DESTINATION)
    .useValue(logs)
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  if (options.docs) setupSwagger(app, app.get(ConfigService));
  await app.init();

  // Each test file starts from a clean PostgreSQL identity state. Files run in sequence.
  // Truncating users cascades into booking tables, whose append-only trigger is not wanted here.
  await app.get<Database>(DATABASE).transaction(async (tx) => {
    await tx.execute(sql`set local session_replication_role = replica`);
    await tx.execute(sql`truncate table "users" cascade`);
    await tx.execute(sql`truncate table "analytics_snapshots"`);
    await tx.execute(sql`truncate table "idempotency_keys"`);
  });

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
