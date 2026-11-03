import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Body,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { MongoIdPipe } from "../../common/pipes/mongo-id.pipe";
import { AuthenticatedUser } from "../../common/types/jwt-payload.interface";
import { BookingsService } from "./bookings.service";
import { CancelBookingDto } from "./dto/cancel-booking.dto";

@Controller("bookings")
@UseGuards(JwtAuthGuard)
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.bookingsService.myBookings(user.userId);
  }

  @Get(":id")
  findOne(@Param("id", MongoIdPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.bookingsService.findOne(id, user.userId);
  }

  @Post(":id/cancellations")
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param("id", MongoIdPipe) id: string,
    @Body() dto: CancelBookingDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bookingsService.cancel(id, dto, user.userId);
  }
}
