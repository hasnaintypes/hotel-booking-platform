import { Module } from "@nestjs/common";
import { MyHotelsService } from "./my-hotels.service";

@Module({
  providers: [MyHotelsService],
  exports: [MyHotelsService],
})
export class MyHotelsModule {}
