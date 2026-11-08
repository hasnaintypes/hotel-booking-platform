import { Global, Module } from "@nestjs/common";
import { AnalyticsRepository } from "./analytics.repository";
import { BookingsRepository } from "./bookings.repository";
import { MigrationsRepository } from "./migrations.repository";
import { ReviewsRepository } from "./reviews.repository";
import { HotelsRepository } from "./hotels.repository";
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
    OutboxRepository,
    InboxRepository,
  ],
  exports: [
    AnalyticsRepository,
    UsersRepository,
    HotelsRepository,
    BookingsRepository,
    ReviewsRepository,
    MigrationsRepository,
    OutboxRepository,
    InboxRepository,
  ],
})
export class DatabaseRepositoriesModule {}
