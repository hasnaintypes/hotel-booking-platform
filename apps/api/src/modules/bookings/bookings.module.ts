import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.module";
import { PaymentsModule } from "../payments/payments.module";
import { BookingsService } from "./bookings.service";

@Module({
  imports: [PaymentsModule, InventoryModule],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
