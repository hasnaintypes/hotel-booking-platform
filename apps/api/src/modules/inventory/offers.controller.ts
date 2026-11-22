import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ZodResponse } from "nestjs-zod";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { AuthenticatedUser } from "../../common/types/jwt-payload.interface";
import { CreateOfferDto } from "./dto/create-offer.dto";
import { OfferDto } from "./dto/offer-response.dto";
import { toOfferResponse } from "./offer-response";
import { OffersService } from "./offers.service";

@Controller("offers")
@UseGuards(JwtAuthGuard)
export class OffersController {
  constructor(private readonly offers: OffersService) {}

  /**
   * Freezes a provider quote for a stay. The returned `id` is passed to `POST /bookings` as
   * `offerId`; the price and cancellation terms can never be changed by the client.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 60, ttl: 900000 } })
  @ZodResponse({
    type: OfferDto,
    status: 201,
    description: "The frozen quote; its id is passed to POST /api/v1/bookings as offerId",
  })
  async create(@Body() dto: CreateOfferDto, @CurrentUser() user: AuthenticatedUser) {
    const offer = await this.offers.createOffer(dto, user.userId);
    return toOfferResponse(offer);
  }
}
