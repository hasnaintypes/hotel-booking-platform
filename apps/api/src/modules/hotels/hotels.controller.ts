import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { OptionalJwtAuthGuard } from "../../common/guards/optional-jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { MongoIdPipe } from "../../common/pipes/mongo-id.pipe";
import { AuthenticatedUser } from "../../common/types/jwt-payload.interface";
import { CreateBookingDto } from "./dto/create-booking.dto";
import { PaymentIntentDto } from "./dto/payment-intent.dto";
import { SearchHotelsDto } from "./dto/search-hotels.dto";
import { ToggleActiveDto } from "./dto/toggle-active.dto";
import { HotelsService } from "./hotels.service";

@Controller("api/hotels")
export class HotelsController {
  constructor(private readonly hotelsService: HotelsService) {}

  @Get("search")
  search(@Query() query: SearchHotelsDto) {
    return this.hotelsService.search(query);
  }

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  findAll(@CurrentUser() viewer: AuthenticatedUser | undefined) {
    return this.hotelsService.findAll(viewer);
  }

  @Patch(":id/active")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  setActive(@Param("id", MongoIdPipe) id: string, @Body() dto: ToggleActiveDto) {
    return this.hotelsService.setActive(id, dto);
  }

  @Get(":id")
  @UseGuards(OptionalJwtAuthGuard)
  findOne(
    @Param("id", MongoIdPipe) id: string,
    @CurrentUser() viewer: AuthenticatedUser | undefined,
  ) {
    return this.hotelsService.findOne(id, viewer);
  }

  @Post(":hotelId/bookings/payment-intent")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 50, ttl: 900000 } })
  createPaymentIntent(
    @Param("hotelId", MongoIdPipe) hotelId: string,
    @Body() dto: PaymentIntentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.hotelsService.createPaymentIntent(hotelId, dto, user.userId);
  }

  @Post(":hotelId/bookings")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  async createBooking(
    @Param("hotelId", MongoIdPipe) hotelId: string,
    @Body() dto: CreateBookingDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const booking = await this.hotelsService.createBooking(hotelId, dto, user.userId);
    res.setHeader("Location", `/api/bookings/${booking._id}`);
    return booking;
  }
}
