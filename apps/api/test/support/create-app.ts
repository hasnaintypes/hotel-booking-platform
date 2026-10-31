import { INestApplication } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { getConnectionToken } from "@nestjs/mongoose";
import { Test } from "@nestjs/testing";
import { Connection } from "mongoose";
import { AppModule } from "../../src/app.module";
import { configureApp } from "../../src/app.setup";
import { CloudinaryService } from "../../src/integrations/cloudinary/cloudinary.service";
import { StripeService } from "../../src/integrations/stripe/stripe.service";
import { createFakeCloudinary, createFakeStripe } from "./fakes";

export type TestApp = {
  app: INestApplication;
  connection: Connection;
  stripe: ReturnType<typeof createFakeStripe>;
  cloudinary: ReturnType<typeof createFakeCloudinary>;
  close: () => Promise<void>;
};

/**
 * Boots the real application module with the production request pipeline
 * (`configureApp`) and external services replaced by fakes.
 */
export async function createTestApp(): Promise<TestApp> {
  const stripe = createFakeStripe();
  const cloudinary = createFakeCloudinary();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(StripeService)
    .useValue(stripe)
    .overrideProvider(CloudinaryService)
    .useValue(cloudinary)
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
    close: async () => {
      await connection.dropDatabase();
      await app.close();
    },
  };
}
