import { Global, Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { GlobalExceptionFilter } from "./errors/global-exception.filter";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { OptionalJwtAuthGuard } from "./guards/optional-jwt-auth.guard";
import { RolesGuard } from "./guards/roles.guard";

@Global()
@Module({
  providers: [
    JwtAuthGuard,
    OptionalJwtAuthGuard,
    RolesGuard,
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
  exports: [JwtAuthGuard, OptionalJwtAuthGuard, RolesGuard],
})
export class CommonModule {}
