import { Module } from "@nestjs/common";
import { HotelsService } from "./hotels.service";

@Module({
  providers: [HotelsService],
  exports: [HotelsService],
})
export class HotelsModule {}
