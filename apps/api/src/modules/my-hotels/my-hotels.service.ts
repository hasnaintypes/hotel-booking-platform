import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { HotelType } from "@hotel-booking/types";
import { BOOKING_MODEL, HOTEL_MODEL, REVIEW_MODEL } from "../../database/models";
import { CloudinaryService } from "../../integrations/cloudinary/cloudinary.service";
import { IBooking } from "../bookings/schemas/booking.schema";
import { IReview } from "../reviews/schemas/review.schema";
import { HotelFormDto } from "./dto/hotel-form.dto";

const classifyBookingCounts = (
  bookings: Array<{ status?: string; checkIn: Date; checkOut: Date }>,
) => {
  const now = new Date();
  let upcoming = 0;
  let completed = 0;
  let cancelled = 0;

  for (const booking of bookings) {
    if (booking.status === "cancelled" || booking.status === "refunded") {
      cancelled += 1;
    } else if (
      booking.status === "completed" ||
      new Date(booking.checkOut).getTime() < now.getTime()
    ) {
      completed += 1;
    } else {
      upcoming += 1;
    }
  }

  return { upcoming, completed, cancelled };
};

@Injectable()
export class MyHotelsService {
  constructor(
    @InjectModel(HOTEL_MODEL) private readonly hotelModel: Model<HotelType>,
    @InjectModel(BOOKING_MODEL) private readonly bookingModel: Model<IBooking>,
    @InjectModel(REVIEW_MODEL) private readonly reviewModel: Model<IReview>,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  /** The owner-editable fields, copied one by one so nothing else can be written. */
  private editableFields(dto: HotelFormDto) {
    return {
      name: dto.name,
      city: dto.city,
      country: dto.country,
      description: dto.description,
      type: dto.type,
      facilities: dto.facilities,
      pricePerNight: dto.pricePerNight,
      starRating: dto.starRating,
      adultCount: dto.adultCount,
      childCount: dto.childCount,
      contact: {
        phone: dto["contact.phone"] || "",
        email: dto["contact.email"] || "",
        website: dto["contact.website"] || "",
      },
      policies: {
        checkInTime: dto["policies.checkInTime"] || "",
        checkOutTime: dto["policies.checkOutTime"] || "",
        cancellationPolicy: dto["policies.cancellationPolicy"] || "",
        petPolicy: dto["policies.petPolicy"] || "",
        smokingPolicy: dto["policies.smokingPolicy"] || "",
      },
    };
  }

  async create(dto: HotelFormDto, files: Express.Multer.File[], userId: string) {
    const imageUrls = await this.cloudinaryService.uploadImages(files || []);

    const hotel = new this.hotelModel({
      ...this.editableFields(dto),
      imageUrls,
      lastUpdated: new Date(),
      userId,
    });
    await hotel.save();
    return hotel;
  }

  async findAll(userId: string) {
    const hotels = await this.hotelModel.find({ userId });
    const hotelIds = hotels.map((hotel) => hotel._id.toString());

    if (hotelIds.length === 0) {
      return [];
    }

    const [allBookings, reviewAggs] = await Promise.all([
      this.bookingModel
        .find({ hotelId: { $in: hotelIds } })
        .select("hotelId status checkIn checkOut"),
      this.reviewModel.aggregate([
        { $match: { hotelId: { $in: hotelIds } } },
        {
          $group: {
            _id: "$hotelId",
            averageRating: { $avg: "$rating" },
            reviewCount: { $sum: 1 },
          },
        },
      ]),
    ]);

    const bookingsByHotel = new Map<string, typeof allBookings>();
    for (const booking of allBookings) {
      const list = bookingsByHotel.get(booking.hotelId) || [];
      list.push(booking);
      bookingsByHotel.set(booking.hotelId, list);
    }

    const reviewByHotel = new Map(
      reviewAggs.map((review) => [
        review._id as string,
        {
          averageRating: Math.round((review.averageRating as number) * 10) / 10,
          reviewCount: review.reviewCount as number,
        },
      ]),
    );

    return hotels.map((hotel) => {
      const id = hotel._id.toString();
      const counts = classifyBookingCounts(bookingsByHotel.get(id) || []);
      const review = reviewByHotel.get(id);
      const obj = hotel.toObject();

      return {
        ...obj,
        upcomingBookings: counts.upcoming,
        completedBookings: counts.completed,
        cancelledBookings: counts.cancelled,
        averageRating: review?.averageRating ?? obj.averageRating ?? obj.starRating ?? 0,
        reviewCount: review?.reviewCount ?? obj.reviewCount ?? 0,
      };
    });
  }

  findOne(id: string, userId: string) {
    return this.hotelModel.findOne({ _id: id, userId });
  }

  async setActive(id: string, isActive: boolean, userId: string) {
    const hotel = await this.hotelModel.findOneAndUpdate(
      { _id: id, userId },
      { isActive, lastUpdated: new Date() },
      { new: true },
    );

    if (!hotel) {
      throw new NotFoundException("Hotel not found");
    }

    return hotel;
  }

  async update(hotelId: string, dto: HotelFormDto, files: Express.Multer.File[], userId: string) {
    const existingHotel = await this.hotelModel.findOne({
      _id: hotelId,
      userId,
    });

    if (!existingHotel) {
      throw new NotFoundException("Hotel not found");
    }

    const updatedHotel = await this.hotelModel.findByIdAndUpdate(
      hotelId,
      { ...this.editableFields(dto), lastUpdated: new Date() },
      { new: true },
    );

    if (!updatedHotel) {
      throw new NotFoundException("Hotel not found");
    }

    if (files && files.length > 0) {
      const updatedImageUrls = await this.cloudinaryService.uploadImages(files);
      updatedHotel.imageUrls = [...updatedImageUrls, ...(dto.imageUrls ?? [])];
      await updatedHotel.save();
    }

    return updatedHotel;
  }
}
