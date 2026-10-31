import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { HotelSearchResponse, HotelType } from "@hotel-booking/types";
import { AuthenticatedUser } from "../../common/types/jwt-payload.interface";
import { escapeRegExp } from "../../common/utils/escape-regexp";
import { BOOKING_MODEL, HOTEL_MODEL, USER_MODEL } from "../../database/models";
import { StripeService } from "../../integrations/stripe/stripe.service";
import { IBooking } from "../bookings/schemas/booking.schema";
import { CreateBookingDto } from "./dto/create-booking.dto";
import { PaymentIntentDto } from "./dto/payment-intent.dto";
import { SearchHotelsDto } from "./dto/search-hotels.dto";
import { ToggleActiveDto } from "./dto/toggle-active.dto";

@Injectable()
export class HotelsService {
  constructor(
    @InjectModel(HOTEL_MODEL) private readonly hotelModel: Model<HotelType>,
    @InjectModel(BOOKING_MODEL) private readonly bookingModel: Model<IBooking>,
    @InjectModel(USER_MODEL) private readonly userModel: Model<any>,
    private readonly stripeService: StripeService,
  ) {}

  private async isAdmin(userId?: string): Promise<boolean> {
    if (!userId) return false;
    const user = await this.userModel.findById(userId).select("role");
    return user?.role === "admin";
  }

  private constructSearchQuery(queryParams: SearchHotelsDto) {
    // Deactivated hotels never appear in guest search.
    const constructedQuery: Record<string, any> = { isActive: { $ne: false } };

    const destination = queryParams.destination?.trim();
    if (destination) {
      // Matched literally: the text is escaped so it cannot act as a pattern.
      const literal = escapeRegExp(destination);
      constructedQuery.$or = [
        { city: { $regex: literal, $options: "i" } },
        { country: { $regex: literal, $options: "i" } },
      ];
    }

    if (queryParams.adultCount !== undefined) {
      constructedQuery.adultCount = { $gte: queryParams.adultCount };
    }

    if (queryParams.childCount !== undefined) {
      constructedQuery.childCount = { $gte: queryParams.childCount };
    }

    if (queryParams.facilities?.length) {
      constructedQuery.facilities = { $all: queryParams.facilities };
    }

    if (queryParams.types?.length) {
      constructedQuery.type = { $in: queryParams.types };
    }

    if (queryParams.stars?.length) {
      constructedQuery.starRating = { $in: queryParams.stars };
    }

    if (queryParams.maxPrice !== undefined) {
      constructedQuery.pricePerNight = { $lte: queryParams.maxPrice };
    }

    return constructedQuery;
  }

  async search(queryParams: SearchHotelsDto): Promise<HotelSearchResponse> {
    const query = this.constructSearchQuery(queryParams);

    let sortOptions: Record<string, 1 | -1> = {};
    switch (queryParams.sortOption) {
      case "starRating":
        sortOptions = { starRating: -1 };
        break;
      case "pricePerNightAsc":
        sortOptions = { pricePerNight: 1 };
        break;
      case "pricePerNightDesc":
        sortOptions = { pricePerNight: -1 };
        break;
    }

    const pageSize = 5;
    const pageNumber = queryParams.page ?? 1;
    const skip = (pageNumber - 1) * pageSize;

    const hotels = await this.hotelModel.find(query).sort(sortOptions).skip(skip).limit(pageSize);

    const total = await this.hotelModel.countDocuments(query);

    return {
      data: hotels,
      pagination: {
        total,
        page: pageNumber,
        pages: Math.ceil(total / pageSize),
      },
    };
  }

  /** Admins see every hotel; everyone else sees only active ones. */
  async findAll(viewer?: AuthenticatedUser) {
    const filter = (await this.isAdmin(viewer?.userId)) ? {} : { isActive: { $ne: false } };
    return this.hotelModel.find(filter).sort("-lastUpdated");
  }

  async setActive(id: string, dto: ToggleActiveDto) {
    const hotel = await this.hotelModel.findByIdAndUpdate(
      id,
      { isActive: dto.isActive, lastUpdated: new Date() },
      { new: true },
    );

    if (!hotel) {
      throw new NotFoundException("Hotel not found");
    }

    return hotel;
  }

  /** An inactive hotel is visible only to its owner and to admins; everyone else gets a 404. */
  async findOne(id: string, viewer?: AuthenticatedUser) {
    const hotel = await this.hotelModel.findById(id);
    if (!hotel) {
      throw new NotFoundException("Hotel not found");
    }

    if (hotel.isActive === false) {
      const isOwner = viewer !== undefined && hotel.userId === viewer.userId;
      if (!isOwner && !(await this.isAdmin(viewer?.userId))) {
        throw new NotFoundException("Hotel not found");
      }
    }

    return hotel;
  }

  async createPaymentIntent(hotelId: string, dto: PaymentIntentDto, userId: string) {
    const hotel = await this.hotelModel.findById(hotelId);
    if (!hotel) {
      throw new BadRequestException("Hotel not found");
    }

    if (hotel.isActive === false) {
      throw new ConflictException("This hotel is not available for booking");
    }

    const totalCost = hotel.pricePerNight * Number(dto.numberOfNights);

    const paymentIntent = await this.stripeService.client.paymentIntents.create({
      amount: totalCost * 100,
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
    const hotel = await this.hotelModel.findById(hotelId);
    if (!hotel) {
      throw new NotFoundException("Hotel not found");
    }
    if (hotel.isActive === false) {
      throw new ConflictException("This hotel is not available for booking");
    }

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

    await this.hotelModel.findByIdAndUpdate(hotelId, {
      $inc: {
        totalBookings: 1,
        totalRevenue: newBooking.totalCost,
      },
    });

    await this.userModel.findByIdAndUpdate(userId, {
      $inc: {
        totalBookings: 1,
        totalSpent: newBooking.totalCost,
      },
    });

    return booking;
  }
}
