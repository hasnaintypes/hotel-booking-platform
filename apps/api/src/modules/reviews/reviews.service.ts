import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { HotelType } from "@hotel-booking/types";
import { BOOKING_MODEL, HOTEL_MODEL, REVIEW_MODEL } from "../../database/models";
import { IBooking } from "../bookings/schemas/booking.schema";
import { CreateReviewDto } from "./dto/create-review.dto";
import { IReview } from "./schemas/review.schema";

@Injectable()
export class ReviewsService {
  constructor(
    @InjectModel(REVIEW_MODEL) private readonly reviewModel: Model<IReview>,
    @InjectModel(HOTEL_MODEL) private readonly hotelModel: Model<HotelType>,
    @InjectModel(BOOKING_MODEL) private readonly bookingModel: Model<IBooking>,
  ) {}

  listAdmin(limit?: string) {
    const parsed = Math.min(parseInt(String(limit || "100"), 10), 200);
    return this.reviewModel.find().sort({ createdAt: -1 }).limit(parsed);
  }

  byHotel(hotelId: string) {
    return this.reviewModel.find({ hotelId }).sort({ createdAt: -1 }).limit(100);
  }

  async summary(hotelId: string) {
    const [aggregate] = await this.reviewModel.aggregate([
      { $match: { hotelId } },
      {
        $group: {
          _id: "$hotelId",
          averageRating: { $avg: "$rating" },
          reviewCount: { $sum: 1 },
        },
      },
    ]);

    return {
      hotelId,
      averageRating: aggregate ? Math.round((aggregate.averageRating as number) * 10) / 10 : 0,
      reviewCount: aggregate?.reviewCount ?? 0,
    };
  }

  async create(dto: CreateReviewDto, userId: string) {
    const hotel = await this.hotelModel.findById(dto.hotelId);
    if (!hotel) {
      throw new NotFoundException("Hotel not found");
    }

    const booking = await this.bookingModel.findOne({
      _id: dto.bookingId,
      userId,
      hotelId: dto.hotelId,
    });
    if (!booking) {
      throw new ForbiddenException("Booking not found for this user/hotel");
    }

    const existing = await this.reviewModel.findOne({
      bookingId: dto.bookingId,
      userId,
    });
    if (existing) {
      throw new ConflictException("Review already exists for this booking");
    }

    const review = new this.reviewModel({
      userId,
      hotelId: dto.hotelId,
      bookingId: dto.bookingId,
      rating: dto.rating,
      comment: dto.comment,
      categories: dto.categories,
      isVerified: booking.paymentStatus === "paid",
    });
    await review.save();

    const [aggregate] = await this.reviewModel.aggregate([
      { $match: { hotelId: dto.hotelId } },
      {
        $group: {
          _id: "$hotelId",
          averageRating: { $avg: "$rating" },
          reviewCount: { $sum: 1 },
        },
      },
    ]);

    if (aggregate) {
      hotel.averageRating = Math.round((aggregate.averageRating as number) * 10) / 10;
      hotel.reviewCount = aggregate.reviewCount as number;
      await hotel.save();
    }

    return review;
  }
}
