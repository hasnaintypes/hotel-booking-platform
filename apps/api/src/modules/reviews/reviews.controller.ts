import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { MongoIdPipe } from "../../common/pipes/mongo-id.pipe";
import { AuthenticatedUser } from "../../common/types/jwt-payload.interface";
import { CreateReviewDto } from "./dto/create-review.dto";
import { ReviewsService } from "./reviews.service";

@Controller("api/reviews")
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  listAdmin(@Query("limit") limit?: string) {
    return this.reviewsService.listAdmin(limit);
  }

  @Get("hotel/:hotelId")
  byHotel(@Param("hotelId", MongoIdPipe) hotelId: string) {
    return this.reviewsService.byHotel(hotelId);
  }

  @Get("hotel/:hotelId/summary")
  summary(@Param("hotelId", MongoIdPipe) hotelId: string) {
    return this.reviewsService.summary(hotelId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateReviewDto, @CurrentUser() user: AuthenticatedUser) {
    return this.reviewsService.create(dto, user.userId);
  }
}
