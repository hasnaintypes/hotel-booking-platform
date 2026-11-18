import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { ZodResponse } from "nestjs-zod";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { IDEMPOTENCY_KEY_HEADER } from "../../common/idempotency/idempotency.utils";
import { Idempotent } from "../../common/idempotency/idempotent.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { BookingReferencePipe } from "../../common/pipes/booking-reference.pipe";
import { UuidPipe } from "../../common/pipes/uuid.pipe";
import { AuthenticatedUser } from "../../common/types/jwt-payload.interface";
import { BookingsService } from "./bookings.service";
import { MyBookingListQueryDto } from "./dto/booking-list-queries.dto";
import {
  BookingCreationDto,
  BookingDto,
  BookingPageDto,
  CancelBookingResponseDto,
} from "./dto/booking-response.dto";
import { CancelBookingDto } from "./dto/cancel-booking.dto";
import { CreateBookingDto } from "./dto/create-booking.dto";

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
  @ZodResponse({ type: BookingPageDto, status: 200, description: "The caller's bookings" })
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: MyBookingListQueryDto) {
    return this.bookingsService.myBookings(user.userId, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Idempotent("bookings.create", { required: true })
  @ZodResponse({
    type: BookingCreationDto,
    status: 201,
    description: "The created (or replayed) booking and its PaymentIntent client secret",
  })
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
  @ZodResponse({ type: BookingDto, status: 200, description: "One booking" })
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
  @ZodResponse({
    type: CancelBookingResponseDto,
    status: 200,
    description: "The cancelled booking and the refund decision",
  })
  cancel(
    @Param("id", UuidPipe) id: string,
    @Body() dto: CancelBookingDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request & { id?: string },
  ) {
    return this.bookingsService.cancel(id, dto, user.userId, request.id);
  }
}
