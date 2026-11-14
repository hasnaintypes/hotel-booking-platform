import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.module";
import { PaymentsModule } from "../payments/payments.module";
import { ReconciliationModule } from "../reconciliation/reconciliation.module";
import { BookingActionsService } from "./booking-actions.service";
import { BookingsService } from "./bookings.service";

@Module({
  imports: [PaymentsModule, InventoryModule, ReconciliationModule],
  providers: [BookingsService, BookingActionsService],
  exports: [BookingsService, BookingActionsService],
})
export class BookingsModule {}
