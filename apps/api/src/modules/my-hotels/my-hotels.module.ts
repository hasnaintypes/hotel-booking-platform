import { Module } from "@nestjs/common";
import { MyHotelsController } from "./my-hotels.controller";
import { MyHotelsService } from "./my-hotels.service";

@Module({
  controllers: [MyHotelsController],
  providers: [MyHotelsService],
})
export class MyHotelsModule {}
