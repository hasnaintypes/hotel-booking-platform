import { Global, Module } from "@nestjs/common";
import { DATABASE, PostgresDatabase } from "./postgres.database";

@Global()
@Module({
  providers: [
    PostgresDatabase,
    {
      provide: DATABASE,
      inject: [PostgresDatabase],
      useFactory: (postgres: PostgresDatabase) => postgres.db,
    },
  ],
  exports: [DATABASE, PostgresDatabase],
})
export class PostgresModule {}
