import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { REVIEW_MODEL } from "../../database/models";
import { BookingsRepository } from "../../database/repositories/bookings.repository";
import { HotelsRepository } from "../../database/repositories/hotels.repository";
import { CreateReviewDto } from "./dto/create-review.dto";
import { IReview } from "./schemas/review.schema";

@Injectable()
export class ReviewsService {
  constructor(
    @InjectModel(REVIEW_MODEL) private readonly reviewModel: Model<IReview>,
    private readonly hotels: HotelsRepository,
    private readonly bookings: BookingsRepository,
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
    const hotel = await this.hotels.findById(dto.hotelId);
    if (!hotel) {
      throw new NotFoundException("Hotel not found");
    }

    const booking = await this.bookings.findById(dto.bookingId);
    if (
      !booking ||
      booking.booking.ownerUserId !== userId ||
      booking.booking.hotelId !== dto.hotelId
    ) {
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
      isVerified: booking.payments.find((payment) => !payment.originalPaymentId)?.status === "paid",
    });
    await review.save();

    return review;
  }
}
