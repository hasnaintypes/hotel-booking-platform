import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Idempotent } from "../../common/idempotency/idempotent.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { UuidPipe } from "../../common/pipes/uuid.pipe";
import { AuthenticatedUser } from "../../common/types/jwt-payload.interface";
import { BookingsService } from "./bookings.service";
import { CancelBookingDto } from "./dto/cancel-booking.dto";
import { CreateBookingDto } from "./dto/create-booking.dto";
import { PaymentIntentDto } from "./dto/payment-intent.dto";

@Controller("bookings")
@UseGuards(JwtAuthGuard)
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.bookingsService.myBookings(user.userId);
  }

  @Post("payment-intents")
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 50, ttl: 900000 } })
  createPaymentIntent(@Body() dto: PaymentIntentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.bookingsService.createPaymentIntent(dto, user.userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Idempotent("bookings.create")
  async create(
    @Body() dto: CreateBookingDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request & { id?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const booking = await this.bookingsService.create(dto, user.userId, request.id);
    res.setHeader("Location", `/api/v1/bookings/${booking._id}`);
    return booking;
  }

  @Get(":id")
  findOne(@Param("id", UuidPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.bookingsService.findOne(id, user.userId);
  }

  @Post(":id/cancellations")
  @HttpCode(HttpStatus.OK)
  @Idempotent("bookings.cancel")
  cancel(
    @Param("id", UuidPipe) id: string,
    @Body() dto: CancelBookingDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request & { id?: string },
  ) {
    return this.bookingsService.cancel(id, dto, user.userId, request.id);
  }
}
