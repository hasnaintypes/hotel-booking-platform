import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Idempotent } from "../../common/idempotency/idempotent.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { UuidPipe } from "../../common/pipes/uuid.pipe";
import { AuthenticatedUser } from "../../common/types/jwt-payload.interface";
import { BookingsService } from "./bookings.service";
import { CancelBookingDto } from "./dto/cancel-booking.dto";

@Controller("bookings")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class AdminBookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get()
  findAll() {
    return this.bookingsService.findAllAdmin();
  }

  @Get(":id")
  findOne(@Param("id", UuidPipe) id: string) {
    return this.bookingsService.findOneAdmin(id);
  }

  @Post(":id/cancel")
  @HttpCode(HttpStatus.OK)
  @Idempotent("bookings.cancel.admin", { required: true })
  cancel(
    @Param("id", UuidPipe) id: string,
    @Body() dto: CancelBookingDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request & { id?: string },
  ) {
    return this.bookingsService.cancel(id, dto, user.userId, request.id);
  }
}
