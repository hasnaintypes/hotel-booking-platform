import { Module } from "@nestjs/common";
import { AuthModule } from "../modules/auth/auth.module";
import { BookingsModule } from "../modules/bookings/bookings.module";
import { BookingsController } from "../modules/bookings/bookings.controller";
import { HotelsModule } from "../modules/hotels/hotels.module";
import { HotelsController } from "../modules/hotels/hotels.controller";
import { InventoryModule } from "../modules/inventory/inventory.module";
import { OffersController } from "../modules/inventory/offers.controller";
import { ReviewsModule } from "../modules/reviews/reviews.module";
import { BookingReviewsController } from "../modules/reviews/booking-reviews.controller";
import { HotelReviewsController } from "../modules/reviews/hotel-reviews.controller";
import { AuthController } from "../modules/auth/auth.controller";
import { UsersModule } from "../modules/users/users.module";
import { MeController } from "../modules/users/me.controller";
import { RegistrationController } from "../modules/users/registration.controller";

/** `/api/v1` — customer and public resources. */
@Module({
  imports: [AuthModule, UsersModule, HotelsModule, BookingsModule, InventoryModule, ReviewsModule],
  controllers: [
    AuthController,
    RegistrationController,
    MeController,
    HotelsController,
    HotelReviewsController,
    BookingReviewsController,
    BookingsController,
    OffersController,
  ],
})
export class PublicRoutesModule {}
