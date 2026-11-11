import { Global, Module } from "@nestjs/common";
import { AnalyticsRepository } from "./analytics.repository";
import { BookingsRepository } from "./bookings.repository";
import { MigrationsRepository } from "./migrations.repository";
import { PaymentsRepository } from "./payments.repository";
import { ReviewsRepository } from "./reviews.repository";
import { StripeWebhookRepository } from "./stripe-webhook.repository";
import { HotelsRepository } from "./hotels.repository";
import { IdempotencyRepository } from "./idempotency.repository";
import { InboxRepository } from "./inbox.repository";
import { OutboxRepository } from "./outbox.repository";
import { UsersRepository } from "./users.repository";

@Global()
@Module({
  providers: [
    AnalyticsRepository,
    UsersRepository,
    HotelsRepository,
    BookingsRepository,
    ReviewsRepository,
    MigrationsRepository,
    PaymentsRepository,
    OutboxRepository,
    InboxRepository,
    IdempotencyRepository,
    StripeWebhookRepository,
  ],
  exports: [
    AnalyticsRepository,
    UsersRepository,
    HotelsRepository,
    BookingsRepository,
    ReviewsRepository,
    MigrationsRepository,
    PaymentsRepository,
    OutboxRepository,
    InboxRepository,
    IdempotencyRepository,
    StripeWebhookRepository,
  ],
})
export class DatabaseRepositoriesModule {}
