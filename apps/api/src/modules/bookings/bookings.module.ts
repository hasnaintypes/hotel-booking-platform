import { Module } from "@nestjs/common";
import { PaymentsModule } from "../payments/payments.module";
import { BookingsService } from "./bookings.service";

@Module({
  imports: [PaymentsModule],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
