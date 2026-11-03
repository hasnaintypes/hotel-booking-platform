import { Module } from "@nestjs/common";
import { MigrationsRepository } from "./migrations.repository";
import { UsersRepository } from "./users.repository";

@Module({
  providers: [UsersRepository, MigrationsRepository],
  exports: [UsersRepository, MigrationsRepository],
})
export class DatabaseRepositoriesModule {}
