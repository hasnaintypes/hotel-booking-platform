import { Body, Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { UuidPipe } from "../../common/pipes/uuid.pipe";
import { AuthenticatedUser } from "../../common/types/jwt-payload.interface";
import { CreateBookingReviewDto } from "./dto/create-booking-review.dto";
import { ReviewsService } from "./reviews.service";

@Controller("bookings")
@UseGuards(JwtAuthGuard)
export class BookingReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post(":bookingId/reviews")
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param("bookingId", UuidPipe) bookingId: string,
    @Body() dto: CreateBookingReviewDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reviewsService.create({ ...dto, bookingId }, user.userId);
  }
}
