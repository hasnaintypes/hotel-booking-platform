import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { HotelSearchResponse, HotelType } from "@hotel-booking/types";
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

  private constructSearchQuery(queryParams: SearchHotelsDto) {
    const constructedQuery: Record<string, any> = {};

    if (queryParams.destination && queryParams.destination.trim() !== "") {
      const destination = queryParams.destination.trim();
      constructedQuery.$or = [
        { city: { $regex: destination, $options: "i" } },
        { country: { $regex: destination, $options: "i" } },
      ];
    }

    if (queryParams.adultCount) {
      constructedQuery.adultCount = { $gte: parseInt(queryParams.adultCount) };
    }

    if (queryParams.childCount) {
      constructedQuery.childCount = { $gte: parseInt(queryParams.childCount) };
    }

    if (queryParams.facilities) {
      constructedQuery.facilities = {
        $all: Array.isArray(queryParams.facilities)
          ? queryParams.facilities
          : [queryParams.facilities],
      };
    }

    if (queryParams.types) {
      constructedQuery.type = {
        $in: Array.isArray(queryParams.types) ? queryParams.types : [queryParams.types],
      };
    }

    if (queryParams.stars) {
      const starRatings = Array.isArray(queryParams.stars)
        ? queryParams.stars.map((star) => parseInt(star))
        : parseInt(queryParams.stars);

      constructedQuery.starRating = { $in: starRatings };
    }

    if (queryParams.maxPrice) {
      constructedQuery.pricePerNight = {
        $lte: parseInt(queryParams.maxPrice).toString(),
      };
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
    const pageNumber = parseInt(queryParams.page ? queryParams.page.toString() : "1");
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

  findAll() {
    return this.hotelModel.find().sort("-lastUpdated");
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

  findOne(id: string) {
    return this.hotelModel.findById(id);
  }

  async createPaymentIntent(hotelId: string, dto: PaymentIntentDto, userId: string) {
    const hotel = await this.hotelModel.findById(hotelId);
    if (!hotel) {
      throw new BadRequestException("Hotel not found");
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
