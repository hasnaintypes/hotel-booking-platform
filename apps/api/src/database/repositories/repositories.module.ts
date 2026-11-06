import { Global, Module } from "@nestjs/common";
import { BookingsRepository } from "./bookings.repository";
import { MigrationsRepository } from "./migrations.repository";
import { HotelsRepository } from "./hotels.repository";
import { UsersRepository } from "./users.repository";

@Global()
@Module({
  providers: [UsersRepository, HotelsRepository, BookingsRepository, MigrationsRepository],
  exports: [UsersRepository, HotelsRepository, BookingsRepository, MigrationsRepository],
})
export class DatabaseRepositoriesModule {}
