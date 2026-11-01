import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { MongoIdPipe } from "../../common/pipes/mongo-id.pipe";
import { AuthenticatedUser } from "../../common/types/jwt-payload.interface";
import { BookingsService } from "./bookings.service";
import { CancelBookingDto } from "./dto/cancel-booking.dto";
import { UpdatePaymentDto } from "./dto/update-payment.dto";
import { UpdateStatusDto } from "./dto/update-status.dto";

@Controller("api/bookings")
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  findAll() {
    return this.bookingsService.findAllAdmin();
  }

  @Get("hotel/:hotelId")
  @UseGuards(JwtAuthGuard)
  findForHotel(
    @Param("hotelId", MongoIdPipe) hotelId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bookingsService.findForHotel(hotelId, user.userId);
  }

  @Post(":id/cancel")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  cancel(
    @Param("id", MongoIdPipe) id: string,
    @Body() dto: CancelBookingDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bookingsService.cancel(id, dto, user.userId);
  }

  @Get(":id")
  @UseGuards(JwtAuthGuard)
  findOne(@Param("id", MongoIdPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.bookingsService.findOne(id, user.userId);
  }

  @Patch(":id/status")
  @UseGuards(JwtAuthGuard)
  updateStatus(
    @Param("id", MongoIdPipe) id: string,
    @Body() dto: UpdateStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bookingsService.updateStatus(id, dto, user.userId);
  }

  @Patch(":id/payment")
  @UseGuards(JwtAuthGuard)
  updatePayment(
    @Param("id", MongoIdPipe) id: string,
    @Body() dto: UpdatePaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bookingsService.updatePayment(id, dto, user.userId);
  }

  @Delete(":id")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  remove(@Param("id", MongoIdPipe) id: string) {
    return this.bookingsService.remove(id);
  }
}
