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
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
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
  findAll() {
    return this.hotelsService.findAll();
  }

  @Patch(":id/active")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  setActive(@Param("id") id: string, @Body() dto: ToggleActiveDto) {
    return this.hotelsService.setActive(id, dto);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.hotelsService.findOne(id);
  }

  @Post(":hotelId/bookings/payment-intent")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 50, ttl: 900000 } })
  createPaymentIntent(
    @Param("hotelId") hotelId: string,
    @Body() dto: PaymentIntentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.hotelsService.createPaymentIntent(hotelId, dto, user.userId);
  }

  @Post(":hotelId/bookings")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  createBooking(
    @Param("hotelId") hotelId: string,
    @Body() dto: CreateBookingDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.hotelsService.createBooking(hotelId, dto, user.userId);
  }
}
