import { Global, Module } from "@nestjs/common";
import { MigrationsRepository } from "./migrations.repository";
import { HotelsRepository } from "./hotels.repository";
import { UsersRepository } from "./users.repository";

@Global()
@Module({
  providers: [UsersRepository, HotelsRepository, MigrationsRepository],
  exports: [UsersRepository, HotelsRepository, MigrationsRepository],
})
export class DatabaseRepositoriesModule {}
