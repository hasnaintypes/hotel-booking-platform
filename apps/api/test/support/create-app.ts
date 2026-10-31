import { INestApplication, Type } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { getConnectionToken } from "@nestjs/mongoose";
import { Test } from "@nestjs/testing";
import { Connection } from "mongoose";
import { AppModule } from "../../src/app.module";
import { configureApp } from "../../src/app.setup";
import { CloudinaryService } from "../../src/integrations/cloudinary/cloudinary.service";
import { StripeService } from "../../src/integrations/stripe/stripe.service";
import { LOG_DESTINATION } from "../../src/common/logging/logging.module";
import { createFakeCloudinary, createFakeStripe } from "./fakes";
import { FaultController } from "./fault.controller";
import { LogSink } from "./log-sink";

export type TestApp = {
  app: INestApplication;
  connection: Connection;
  stripe: ReturnType<typeof createFakeStripe>;
  cloudinary: ReturnType<typeof createFakeCloudinary>;
  logs: LogSink;
  close: () => Promise<void>;
};

export type CreateTestAppOptions = {
  /** Adds the test-only controller that raises each error class. */
  faults?: boolean;
  controllers?: Type<unknown>[];
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
  await app.init();

  const connection = app.get<Connection>(getConnectionToken());

  return {
    app,
    connection,
    stripe,
    cloudinary,
    logs,
    close: async () => {
      await connection.dropDatabase();
      await app.close();
    },
  };
}
