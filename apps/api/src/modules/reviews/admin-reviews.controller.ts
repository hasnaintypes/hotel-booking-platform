import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ZodResponse } from "nestjs-zod";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { AdminReviewListQueryDto } from "./dto/list-reviews-query.dto";
import { ReviewPageDto } from "./dto/review-response.dto";
import { ReviewsService } from "./reviews.service";

@Controller("reviews")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class AdminReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  @ZodResponse({ type: ReviewPageDto, status: 200, description: "One page of every review" })
  listAdmin(@Query() query: AdminReviewListQueryDto) {
    return this.reviewsService.listAdmin(query);
  }
}
