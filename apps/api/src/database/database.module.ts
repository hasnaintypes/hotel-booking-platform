import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { AnalyticsSchema } from "../modules/analytics/schemas/analytics-snapshot.schema";
import { BookingSchema } from "../modules/bookings/schemas/booking.schema";
import { HotelSchema } from "../modules/hotels/schemas/hotel.schema";
import { ReviewSchema } from "../modules/reviews/schemas/review.schema";
import { ANALYTICS_MODEL, BOOKING_MODEL, HOTEL_MODEL, REVIEW_MODEL } from "./models";
import { DATABASE, PostgresDatabase } from "./postgres.database";

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
      { name: HOTEL_MODEL, schema: HotelSchema },
      { name: BOOKING_MODEL, schema: BookingSchema },
      { name: REVIEW_MODEL, schema: ReviewSchema },
      { name: ANALYTICS_MODEL, schema: AnalyticsSchema },
    ]),
  ],
  providers: [
    PostgresDatabase,
    {
      provide: DATABASE,
      inject: [PostgresDatabase],
      useFactory: (postgres: PostgresDatabase) => postgres.db,
    },
  ],
  exports: [MongooseModule, DATABASE, PostgresDatabase],
})
export class DatabaseModule {}
