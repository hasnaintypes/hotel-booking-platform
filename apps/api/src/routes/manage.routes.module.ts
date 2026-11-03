import { Module } from "@nestjs/common";
import { AiModule } from "../modules/ai/ai.module";
import { AiController } from "../modules/ai/ai.controller";
import { BookingsModule } from "../modules/bookings/bookings.module";
import { ManageBookingsController } from "../modules/bookings/manage-bookings.controller";
import { MyHotelsModule } from "../modules/my-hotels/my-hotels.module";
import { MyHotelsController } from "../modules/my-hotels/my-hotels.controller";

/** `/api/v1/manage` — hotel owners and organisation members. */
@Module({
  imports: [MyHotelsModule, BookingsModule, AiModule],
  controllers: [MyHotelsController, ManageBookingsController, AiController],
})
export class ManageRoutesModule {}
