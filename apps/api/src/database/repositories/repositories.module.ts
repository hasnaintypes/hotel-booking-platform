import { Global, Module } from "@nestjs/common";
import { BookingsRepository } from "./bookings.repository";
import { MigrationsRepository } from "./migrations.repository";
import { ReviewsRepository } from "./reviews.repository";
import { HotelsRepository } from "./hotels.repository";
import { UsersRepository } from "./users.repository";

@Global()
@Module({
  providers: [
    UsersRepository,
    HotelsRepository,
    BookingsRepository,
    ReviewsRepository,
    MigrationsRepository,
  ],
  exports: [
    UsersRepository,
    HotelsRepository,
    BookingsRepository,
    ReviewsRepository,
    MigrationsRepository,
  ],
})
export class DatabaseRepositoriesModule {}
