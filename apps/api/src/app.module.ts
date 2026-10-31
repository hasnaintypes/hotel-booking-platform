import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { CommonModule } from "./common/common.module";
import { AppLoggingModule } from "./common/logging/logging.module";
import { configuration } from "./config/configuration";
import { validateEnv } from "./config/env.validation";
import { DatabaseModule } from "./database/database.module";
import { CloudinaryModule } from "./integrations/cloudinary/cloudinary.module";
import { LlmModule } from "./integrations/llm/llm.module";
import { StripeModule } from "./integrations/stripe/stripe.module";
import { AiModule } from "./modules/ai/ai.module";
import { AnalyticsModule } from "./modules/analytics/analytics.module";
import { AuthModule } from "./modules/auth/auth.module";
import { BookingsModule } from "./modules/bookings/bookings.module";
import { BusinessInsightsModule } from "./modules/business-insights/business-insights.module";
import { HealthModule } from "./modules/health/health.module";
import { HotelsModule } from "./modules/hotels/hotels.module";
import { MyHotelsModule } from "./modules/my-hotels/my-hotels.module";
import { ReviewsModule } from "./modules/reviews/reviews.module";
import { UsersModule } from "./modules/users/users.module";
import { AppController } from "./app.controller";

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
    CommonModule,
    DatabaseModule,
    StripeModule,
    CloudinaryModule,
    LlmModule,
    AuthModule,
    UsersModule,
    HotelsModule,
    MyHotelsModule,
    BookingsModule,
    ReviewsModule,
    BusinessInsightsModule,
    AnalyticsModule,
    AiModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
