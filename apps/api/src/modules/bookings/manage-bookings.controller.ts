import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { UuidPipe } from "../../common/pipes/uuid.pipe";
import { AuthenticatedUser } from "../../common/types/jwt-payload.interface";
import { BookingsService } from "./bookings.service";
import { HotelBookingListQueryDto } from "./dto/booking-list-queries.dto";

@Controller("hotels")
@UseGuards(JwtAuthGuard)
export class ManageBookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get(":hotelId/bookings")
  findForHotel(
    @Param("hotelId", UuidPipe) hotelId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: HotelBookingListQueryDto,
  ) {
    return this.bookingsService.findForHotel(hotelId, user.userId, query);
  }
}
