import { Module } from "@nestjs/common";
import { PaymentsModule } from "../payments/payments.module";
import { BookingQuoteService } from "./booking-quote.service";
import { BookingsService } from "./bookings.service";

@Module({
  imports: [PaymentsModule],
  providers: [BookingsService, BookingQuoteService],
  exports: [BookingsService, BookingQuoteService],
})
export class BookingsModule {}
