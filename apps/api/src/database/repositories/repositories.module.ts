import { Global, Module } from "@nestjs/common";
import { MigrationsRepository } from "./migrations.repository";
import { UsersRepository } from "./users.repository";

@Global()
@Module({
  providers: [UsersRepository, MigrationsRepository],
  exports: [UsersRepository, MigrationsRepository],
})
export class DatabaseRepositoriesModule {}
