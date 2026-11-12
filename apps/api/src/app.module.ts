import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { ClockModule } from "./common/clock";
import { CommonModule } from "./common/common.module";
import { IdempotencyModule } from "./common/idempotency/idempotency.module";
import { AppLoggingModule } from "./common/logging/logging.module";
import { configuration } from "./config/configuration";
import { validateEnv } from "./config/env.validation";
import { PostgresModule } from "./database/postgres.module";
import { DatabaseRepositoriesModule } from "./database/repositories/repositories.module";
import { CloudinaryModule } from "./integrations/cloudinary/cloudinary.module";
import { LlmModule } from "./integrations/llm/llm.module";
import { StripeModule } from "./integrations/stripe/stripe.module";
import { JobsModule } from "./modules/jobs/jobs.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { WebhooksModule } from "./modules/webhooks/webhooks.module";
import { HealthModule } from "./modules/health/health.module";
import { RoutesModule } from "./routes/routes.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validate: validateEnv,
    }),
    AppLoggingModule,
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>("jwt.secret"),
        signOptions: { expiresIn: config.get<string>("jwt.expiresIn") as any },
      }),
    }),
    ThrottlerModule.forRoot([{ name: "default", ttl: 900000, limit: 200 }]),
    ClockModule,
    CommonModule,
    IdempotencyModule,
    PostgresModule,
    DatabaseRepositoriesModule,
    StripeModule,
    CloudinaryModule,
    LlmModule,
    PaymentsModule,
    WebhooksModule,
    JobsModule,
    RoutesModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
