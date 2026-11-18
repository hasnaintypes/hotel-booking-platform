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
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { ZodResponse } from "nestjs-zod";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { Idempotent } from "../../common/idempotency/idempotent.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { UuidPipe } from "../../common/pipes/uuid.pipe";
import { AuthenticatedUser } from "../../common/types/jwt-payload.interface";
import { BookingActionsService } from "./booking-actions.service";
import { BookingsService } from "./bookings.service";
import { AdminCancelBookingDto } from "./dto/admin-cancel-booking.dto";
import {
  BookingDetailDto,
  BookingPageDto,
  CancelBookingResponseDto,
} from "./dto/booking-response.dto";
import { ListBookingsQueryDto } from "./dto/list-bookings-query.dto";
import { ManualBookingActionDto } from "./dto/manual-booking-action.dto";

/**
 * Admin booking operations. Reads need `booking.read`; each manual action has its own permission
 * and its own route so the guard can authorise it without inspecting the request body. No route
 * accepts a status: the only way to change one is a state-machine transition with a reason.
 */
@Controller("bookings")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions("booking.read")
export class AdminBookingsController {
  constructor(
    private readonly bookingsService: BookingsService,
    private readonly bookingActions: BookingActionsService,
  ) {}

  @Get()
  @ZodResponse({ type: BookingPageDto, status: 200, description: "One page of the bookings queue" })
  findAll(@Query() query: ListBookingsQueryDto) {
    return this.bookingsService.findAllAdmin(query);
  }

  @Get(":id")
  @ZodResponse({
    type: BookingDetailDto,
    status: 200,
    description: "One booking with its events, ledger and supplier references",
  })
  findOne(@Param("id", UuidPipe) id: string) {
    return this.bookingsService.findOneAdmin(id);
  }

  @Post(":id/cancel")
  @HttpCode(HttpStatus.OK)
  @Idempotent("bookings.cancel.admin", { required: true })
  @RequirePermissions("booking.cancel")
  @ZodResponse({
    type: CancelBookingResponseDto,
    status: 200,
    description: "The cancelled booking and the refund decision",
  })
  cancel(
    @Param("id", UuidPipe) id: string,
    @Body() dto: AdminCancelBookingDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request & { id?: string },
  ) {
    return this.bookingsService.cancel(
      id,
      { cancellationReason: dto.reason },
      user.userId,
      request.id,
      {
        permission: "booking.cancel",
        source: "admin-console",
      },
    );
  }

  @Post(":id/retry")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions("booking.retry")
  @ZodResponse({
    type: BookingDetailDto,
    status: 200,
    description: "The booking after the retry, with its refreshed events and ledger",
  })
  retry(
    @Param("id", UuidPipe) id: string,
    @Body() dto: ManualBookingActionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request & { id?: string },
  ) {
    return this.bookingActions.retry(id, dto, user.userId, request.id);
  }

  @Post(":id/review")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions("booking.mark_reviewed")
  @ZodResponse({
    type: BookingDetailDto,
    status: 200,
    description: "The booking after the review note was recorded",
  })
  review(
    @Param("id", UuidPipe) id: string,
    @Body() dto: ManualBookingActionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request & { id?: string },
  ) {
    return this.bookingsService.markReviewed(id, dto, user.userId, request.id);
  }
}
