import { Controller, Get, Param } from "@nestjs/common";
import { UuidPipe } from "../../common/pipes/uuid.pipe";
import { ReviewsService } from "./reviews.service";

@Controller("hotels")
export class HotelReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get(":hotelId/reviews")
  byHotel(@Param("hotelId", UuidPipe) hotelId: string) {
    return this.reviewsService.byHotel(hotelId);
  }

  @Get(":hotelId/rating")
  summary(@Param("hotelId", UuidPipe) hotelId: string) {
    return this.reviewsService.summary(hotelId);
  }
}
