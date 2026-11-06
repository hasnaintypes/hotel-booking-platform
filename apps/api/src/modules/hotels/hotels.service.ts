import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { HotelSearchResponse, HotelType } from "@hotel-booking/types";
import type { FieldError } from "../../common/errors/problem";
import { ValidationFailedException } from "../../common/errors/validation-failed.exception";
import { AuthenticatedUser } from "../../common/types/jwt-payload.interface";
import { BOOKING_MODEL } from "../../database/models";
import { HotelsRepository, type HotelRecord } from "../../database/repositories/hotels.repository";
import { UsersRepository } from "../../database/repositories/users.repository";
import { StripeService } from "../../integrations/stripe/stripe.service";
import { IBooking } from "../bookings/schemas/booking.schema";
import { CreateBookingDto } from "./dto/create-booking.dto";
import { PaymentIntentDto } from "./dto/payment-intent.dto";
import { SearchHotelsDto } from "./dto/search-hotels.dto";
import { ToggleActiveDto } from "./dto/toggle-active.dto";
import { toHotelResponse } from "./hotel-response";
import { HotelStatsService } from "./hotel-stats.service";

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class HotelsService {
  constructor(
    private readonly hotels: HotelsRepository,
    private readonly hotelStats: HotelStatsService,
    @InjectModel(BOOKING_MODEL) private readonly bookingModel: Model<IBooking>,
    private readonly users: UsersRepository,
    private readonly stripeService: StripeService,
    private readonly config: ConfigService,
  ) {}

  private get maxNights(): number {
    return this.config.get<number>("booking.maxNights") ?? 30;
  }

  /**
   * Rules that depend on the hotel or on today's date. Field formats are checked earlier by
   * CreateBookingDto. Check-in may be one day before today (UTC) so a guest in a time zone ahead
   * of UTC can still book "today".
   */
  private validateStay(
    dto: CreateBookingDto,
    hotel: Pick<HotelRecord, "adultCount" | "childCount">,
  ) {
    const errors: FieldError[] = [];
    const checkIn = new Date(dto.checkIn).getTime();
    const checkOut = new Date(dto.checkOut).getTime();

    const startOfTodayUtc = new Date().setUTCHours(0, 0, 0, 0);
    if (checkIn < startOfTodayUtc - DAY_MS) {
      errors.push({ field: "checkIn", message: "check-in cannot be in the past" });
    }

    if (checkOut <= checkIn) {
      errors.push({ field: "checkOut", message: "check-out must be after check-in" });
    } else if (Math.ceil((checkOut - checkIn) / DAY_MS) > this.maxNights) {
      errors.push({
        field: "checkOut",
        message: `a stay cannot exceed ${this.maxNights} nights`,
      });
    }

    if (dto.adultCount > hotel.adultCount) {
      errors.push({
        field: "adultCount",
        message: `this hotel allows at most ${hotel.adultCount} adults`,
      });
    }
    if (dto.childCount > hotel.childCount) {
      errors.push({
        field: "childCount",
        message: `this hotel allows at most ${hotel.childCount} children`,
      });
    }

    if (errors.length > 0) {
      throw new ValidationFailedException(errors);
    }
  }

  private async isAdmin(userId?: string): Promise<boolean> {
    if (!userId) return false;
    const user = await this.users.findById(userId);
    return user?.role === "admin";
  }

  private async enrich(records: HotelRecord[]): Promise<HotelType[]> {
    const stats = await this.hotelStats.forHotels(records.map((hotel) => hotel.id));
    return records.map((hotel) => toHotelResponse(hotel, stats.get(hotel.id)));
  }

  private async enrichOne(hotel: HotelRecord): Promise<HotelType> {
    return toHotelResponse(hotel, await this.hotelStats.forHotel(hotel.id));
  }

  async search(queryParams: SearchHotelsDto): Promise<HotelSearchResponse> {
    const result = await this.hotels.search({
      destination: queryParams.destination,
      adultCount: queryParams.adultCount,
      childCount: queryParams.childCount,
      facilities: queryParams.facilities,
      types: queryParams.types,
      stars: queryParams.stars,
      maxPrice: queryParams.maxPrice,
      sortOption: queryParams.sortOption,
      page: queryParams.page,
    });

    return {
      data: await this.enrich(result.data),
      pagination: result.pagination,
    };
  }

  /** Guests and owners see active hotels; administrators use the admin list. */
  findAll() {
    return this.hotels.listActive().then((records) => this.enrich(records));
  }

  findAllAdmin() {
    return this.hotels.listAll().then((records) => this.enrich(records));
  }

  async setActive(id: string, dto: ToggleActiveDto) {
    // ToggleActiveDto already guarantees a boolean. Checked again here so that a caller that
    // bypasses the DTO can never write anything but a boolean into the update.
    const isActive: unknown = dto.isActive;
    if (typeof isActive !== "boolean") {
      throw new BadRequestException("isActive boolean required");
    }

    const hotel = await this.hotels.setStatus(id, isActive);
    if (!hotel) {
      throw new NotFoundException("Hotel not found");
    }

    return this.enrichOne(hotel);
  }

  /** An inactive hotel is visible only to its owner and to admins; everyone else gets a 404. */
  async findOne(id: string, viewer?: AuthenticatedUser): Promise<HotelType> {
    const hotel = await this.hotels.findById(id);
    if (!hotel) {
      throw new NotFoundException("Hotel not found");
    }

    if (hotel.status !== "active") {
      const isOwner = viewer !== undefined && hotel.ownerUserId === viewer.userId;
      if (!isOwner && !(await this.isAdmin(viewer?.userId))) {
        throw new NotFoundException("Hotel not found");
      }
    }

    return this.enrichOne(hotel);
  }

  async findOneAdmin(id: string): Promise<HotelType> {
    const hotel = await this.hotels.findById(id);
    if (!hotel) {
      throw new NotFoundException("Hotel not found");
    }
    return this.enrichOne(hotel);
  }

  async createPaymentIntent(hotelId: string, dto: PaymentIntentDto, userId: string) {
    const hotel = await this.hotels.findById(hotelId);
    if (!hotel) {
      throw new BadRequestException("Hotel not found");
    }

    if (hotel.status !== "active") {
      throw new ConflictException("This hotel is not available for booking");
    }

    const nights = Number(dto.numberOfNights);
    if (nights > this.maxNights) {
      throw new ValidationFailedException([
        { field: "numberOfNights", message: `a stay cannot exceed ${this.maxNights} nights` },
      ]);
    }

    const totalCost = (hotel.pricePerNightMinor / 100) * nights;

    const paymentIntent = await this.stripeService.client.paymentIntents.create({
      amount: Math.round(totalCost * 100),
      currency: "gbp",
      metadata: {
        hotelId,
        userId,
      },
    });

    if (!paymentIntent.client_secret) {
      throw new InternalServerErrorException("Error creating payment intent");
    }

    return {
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret.toString(),
      totalCost,
    };
  }

  async createBooking(hotelId: string, dto: CreateBookingDto, userId: string) {
    const hotel = await this.hotels.findById(hotelId);
    if (!hotel) {
      throw new NotFoundException("Hotel not found");
    }
    if (hotel.status !== "active") {
      throw new ConflictException("This hotel is not available for booking");
    }
    this.validateStay(dto, hotel);

    const paymentIntent = await this.stripeService.client.paymentIntents.retrieve(
      dto.paymentIntentId,
    );

    if (!paymentIntent) {
      throw new BadRequestException("payment intent not found");
    }

    if (paymentIntent.metadata.hotelId !== hotelId || paymentIntent.metadata.userId !== userId) {
      throw new BadRequestException("payment intent mismatch");
    }

    if (paymentIntent.status !== "succeeded") {
      throw new BadRequestException(
        `payment intent not succeeded. Status: ${paymentIntent.status}`,
      );
    }

    const newBooking = {
      ...dto,
      hotelId,
      userId,
      createdAt: new Date(),
      status: "confirmed",
      paymentStatus: "paid",
      stripePaymentIntentId: paymentIntent.id,
    };

    const booking = new this.bookingModel(newBooking);
    await booking.save();

    return booking;
  }
}
