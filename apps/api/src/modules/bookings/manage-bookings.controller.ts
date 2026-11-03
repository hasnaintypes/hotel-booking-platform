import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { MongoIdPipe } from "../../common/pipes/mongo-id.pipe";
import { AuthenticatedUser } from "../../common/types/jwt-payload.interface";
import { BookingsService } from "./bookings.service";

@Controller("hotels")
@UseGuards(JwtAuthGuard)
export class ManageBookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get(":hotelId/bookings")
  findForHotel(
    @Param("hotelId", MongoIdPipe) hotelId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bookingsService.findForHotel(hotelId, user.userId);
  }
}
