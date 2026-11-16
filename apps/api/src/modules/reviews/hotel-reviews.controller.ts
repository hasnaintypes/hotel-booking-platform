import { Controller, Get, Param, Query } from "@nestjs/common";
import { UuidPipe } from "../../common/pipes/uuid.pipe";
import { HotelReviewListQueryDto } from "./dto/list-reviews-query.dto";
import { ReviewsService } from "./reviews.service";

@Controller("hotels")
export class HotelReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get(":hotelId/reviews")
  byHotel(@Param("hotelId", UuidPipe) hotelId: string, @Query() query: HotelReviewListQueryDto) {
    return this.reviewsService.byHotel(hotelId, query);
  }

  @Get(":hotelId/rating")
  summary(@Param("hotelId", UuidPipe) hotelId: string) {
    return this.reviewsService.summary(hotelId);
  }
}
