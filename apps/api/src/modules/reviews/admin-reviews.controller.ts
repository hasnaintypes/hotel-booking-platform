import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { AdminReviewListQueryDto } from "./dto/list-reviews-query.dto";
import { ReviewsService } from "./reviews.service";

@Controller("reviews")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class AdminReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  listAdmin(@Query() query: AdminReviewListQueryDto) {
    return this.reviewsService.listAdmin(query);
  }
}
