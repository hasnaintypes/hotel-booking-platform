import { Module } from "@nestjs/common";
import { HotelsModule } from "../hotels/hotels.module";
import { MyHotelsService } from "./my-hotels.service";

@Module({
  imports: [HotelsModule],
  providers: [MyHotelsService],
  exports: [MyHotelsService],
})
export class MyHotelsModule {}
