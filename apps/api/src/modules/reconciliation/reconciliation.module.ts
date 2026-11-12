import { Module } from "@nestjs/common";
import { CLOCK, SystemClock } from "../../common/clock";
import { PaymentsModule } from "../payments/payments.module";
import { BookingRecoveryService } from "./booking-recovery.service";
import { ReconciliationService } from "./reconciliation.service";

/**
 * Recovery and reconciliation logic shared by the scheduled jobs and (from #56) the admin view.
 * Everything here is safe to run on demand: no provider mutation happens without a stable
 * idempotency key or an explicit state predicate.
 */
@Module({
  imports: [PaymentsModule],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    BookingRecoveryService,
    ReconciliationService,
  ],
  exports: [CLOCK, BookingRecoveryService, ReconciliationService],
})
export class ReconciliationModule {}
