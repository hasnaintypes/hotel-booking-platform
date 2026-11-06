import { Module } from "@nestjs/common";
import { HotelStatsService } from "./hotel-stats.service";
import { HotelsService } from "./hotels.service";

@Module({
  providers: [HotelsService, HotelStatsService],
  exports: [HotelsService, HotelStatsService],
})
export class HotelsModule {}
