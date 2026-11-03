import { Controller, Get, Param } from "@nestjs/common";
import { MongoIdPipe } from "../../common/pipes/mongo-id.pipe";
import { ReviewsService } from "./reviews.service";

@Controller("hotels")
export class HotelReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get(":hotelId/reviews")
  byHotel(@Param("hotelId", MongoIdPipe) hotelId: string) {
    return this.reviewsService.byHotel(hotelId);
  }

  @Get(":hotelId/rating")
  summary(@Param("hotelId", MongoIdPipe) hotelId: string) {
    return this.reviewsService.summary(hotelId);
  }
}
