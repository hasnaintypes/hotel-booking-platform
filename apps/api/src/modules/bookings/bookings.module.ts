import { Module } from "@nestjs/common";
import { BookingsController } from "./bookings.controller";
import { BookingsService } from "./bookings.service";
import { MyBookingsController } from "./my-bookings.controller";

@Module({
  controllers: [BookingsController, MyBookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
