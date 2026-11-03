import { Module } from "@nestjs/common";
import { BookingsService } from "./bookings.service";

@Module({
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
