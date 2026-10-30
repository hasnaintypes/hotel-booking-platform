import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { AnalyticsSchema } from "../modules/analytics/schemas/analytics-snapshot.schema";
import { BookingSchema } from "../modules/bookings/schemas/booking.schema";
import { HotelSchema } from "../modules/hotels/schemas/hotel.schema";
import { ReviewSchema } from "../modules/reviews/schemas/review.schema";
import { UserSchema } from "../modules/users/schemas/user.schema";
import { ANALYTICS_MODEL, BOOKING_MODEL, HOTEL_MODEL, REVIEW_MODEL, USER_MODEL } from "./models";

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>("mongodb.uri"),
      }),
    }),
    MongooseModule.forFeature([
      { name: USER_MODEL, schema: UserSchema },
      { name: HOTEL_MODEL, schema: HotelSchema },
      { name: BOOKING_MODEL, schema: BookingSchema },
      { name: REVIEW_MODEL, schema: ReviewSchema },
      { name: ANALYTICS_MODEL, schema: AnalyticsSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}
