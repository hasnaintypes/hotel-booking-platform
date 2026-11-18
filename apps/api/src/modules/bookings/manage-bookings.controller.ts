import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { ZodResponse } from "nestjs-zod";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { UuidPipe } from "../../common/pipes/uuid.pipe";
import { AuthenticatedUser } from "../../common/types/jwt-payload.interface";
import { BookingsService } from "./bookings.service";
import { HotelBookingListQueryDto } from "./dto/booking-list-queries.dto";
import { BookingPageDto } from "./dto/booking-response.dto";

@Controller("hotels")
@UseGuards(JwtAuthGuard)
export class ManageBookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get(":hotelId/bookings")
  @ZodResponse({
    type: BookingPageDto,
    status: 200,
    description: "One page of the hotel's bookings",
  })
  findForHotel(
    @Param("hotelId", UuidPipe) hotelId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: HotelBookingListQueryDto,
  ) {
    return this.bookingsService.findForHotel(hotelId, user.userId, query);
  }
}
