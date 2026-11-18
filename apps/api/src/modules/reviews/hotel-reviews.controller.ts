import { Controller, Get, Param, Query } from "@nestjs/common";
import { ZodResponse } from "nestjs-zod";
import { UuidPipe } from "../../common/pipes/uuid.pipe";
import { HotelReviewListQueryDto } from "./dto/list-reviews-query.dto";
import { ReviewPageDto, ReviewSummaryDto } from "./dto/review-response.dto";
import { ReviewsService } from "./reviews.service";

@Controller("hotels")
export class HotelReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get(":hotelId/reviews")
  @ZodResponse({ type: ReviewPageDto, status: 200, description: "One page of the hotel's reviews" })
  byHotel(@Param("hotelId", UuidPipe) hotelId: string, @Query() query: HotelReviewListQueryDto) {
    return this.reviewsService.byHotel(hotelId, query);
  }

  @Get(":hotelId/rating")
  @ZodResponse({ type: ReviewSummaryDto, status: 200, description: "The hotel's rating summary" })
  summary(@Param("hotelId", UuidPipe) hotelId: string) {
    return this.reviewsService.summary(hotelId);
  }
}
