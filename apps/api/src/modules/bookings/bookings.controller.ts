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
import { IDEMPOTENCY_KEY_HEADER } from "../../common/idempotency/idempotency.utils";
import { Idempotent } from "../../common/idempotency/idempotent.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { BookingReferencePipe } from "../../common/pipes/booking-reference.pipe";
import { UuidPipe } from "../../common/pipes/uuid.pipe";
import { AuthenticatedUser } from "../../common/types/jwt-payload.interface";
import { BookingsService } from "./bookings.service";
import { CancelBookingDto } from "./dto/cancel-booking.dto";
import { CreateBookingDto } from "./dto/create-booking.dto";
import { PaymentIntentDto } from "./dto/payment-intent.dto";

const idempotencyKeyOf = (request: Request): string | undefined => {
  const raw = request.headers[IDEMPOTENCY_KEY_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === undefined ? undefined : value;
};

@Controller("bookings")
@UseGuards(JwtAuthGuard)
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.bookingsService.myBookings(user.userId);
  }

  /**
   * Temporary checkout step kept for the web SPA until #55 migrates it to `POST /bookings`.
   * @deprecated Use `POST /api/v1/bookings`, which prices the stay server-side and creates the
   * PaymentIntent itself.
   */
  @Post("payment-intents")
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 50, ttl: 900000 } })
  createPaymentIntent(@Body() dto: PaymentIntentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.bookingsService.createPaymentIntent(dto, user.userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Idempotent("bookings.create", { required: true })
  async create(
    @Body() dto: CreateBookingDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request & { id?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const booking = await this.bookingsService.create(
      dto,
      user.userId,
      request.id,
      idempotencyKeyOf(request),
    );
    res.setHeader("Location", `/api/v1/bookings/${booking.publicReference}`);
    return booking;
  }

  @Get(":id")
  findOne(@Param("id", BookingReferencePipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.bookingsService.findOne(id, user.userId);
  }

  /**
   * Cancels a booking under its frozen policy and refunds the computed amount. The key is required
   * so a retried request cannot refund twice even after the stored response expires.
   */
  @Post(":id/cancel")
  @HttpCode(HttpStatus.OK)
  @Idempotent("bookings.cancel", { required: true })
  cancel(
    @Param("id", UuidPipe) id: string,
    @Body() dto: CancelBookingDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request & { id?: string },
  ) {
    return this.bookingsService.cancel(id, dto, user.userId, request.id);
  }
}
