import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { HotelType } from "@hotel-booking/types";
import { BOOKING_MODEL, HOTEL_MODEL, REVIEW_MODEL } from "../../database/models";
import { CloudinaryService } from "../../integrations/cloudinary/cloudinary.service";
import { IBooking } from "../bookings/schemas/booking.schema";
import { IReview } from "../reviews/schemas/review.schema";

const toArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.length > 0) return [value];
  return [];
};

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

  private parseContact(body: Record<string, any>) {
    return {
      phone: body["contact.phone"] || "",
      email: body["contact.email"] || "",
      website: body["contact.website"] || "",
    };
  }

  private parsePolicies(body: Record<string, any>) {
    return {
      checkInTime: body["policies.checkInTime"] || "",
      checkOutTime: body["policies.checkOutTime"] || "",
      cancellationPolicy: body["policies.cancellationPolicy"] || "",
      petPolicy: body["policies.petPolicy"] || "",
      smokingPolicy: body["policies.smokingPolicy"] || "",
    };
  }

  private validateHotelBody(body: Record<string, any>) {
    const required = ["name", "city", "country", "description"];
    for (const field of required) {
      if (!body[field]) {
        throw new BadRequestException(`${field} is required`);
      }
    }

    if (!body.type || toArray(body.type).length === 0) {
      throw new BadRequestException("Select at least one hotel type");
    }

    if (body.pricePerNight === undefined || Number.isNaN(Number(body.pricePerNight))) {
      throw new BadRequestException("Price per night is required and must be a number");
    }

    if (!body.facilities) {
      throw new BadRequestException("Facilities are required");
    }
  }

  async create(body: Record<string, any>, files: Express.Multer.File[], userId: string) {
    this.validateHotelBody(body);

    const imageUrls = await this.cloudinaryService.uploadImages(files || []);

    const newHotel: Record<string, any> = {
      ...body,
      type: toArray(body.type),
      facilities: toArray(body.facilities),
      pricePerNight: Number(body.pricePerNight),
      starRating: body.starRating !== undefined ? Number(body.starRating) : undefined,
      adultCount: body.adultCount !== undefined ? Number(body.adultCount) : undefined,
      childCount: body.childCount !== undefined ? Number(body.childCount) : undefined,
      contact: this.parseContact(body),
      policies: this.parsePolicies(body),
      imageUrls,
      lastUpdated: new Date(),
      userId,
    };

    const hotel = new this.hotelModel(newHotel);
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

  async update(
    hotelId: string,
    body: Record<string, any>,
    files: Express.Multer.File[],
    userId: string,
  ) {
    const existingHotel = await this.hotelModel.findOne({
      _id: hotelId,
      userId,
    });

    if (!existingHotel) {
      throw new NotFoundException("Hotel not found");
    }

    const updateData: Record<string, any> = {
      name: body.name,
      city: body.city,
      country: body.country,
      description: body.description,
      type: toArray(body.type),
      pricePerNight: Number(body.pricePerNight),
      starRating: Number(body.starRating),
      adultCount: Number(body.adultCount),
      childCount: Number(body.childCount),
      facilities: toArray(body.facilities),
      lastUpdated: new Date(),
      contact: this.parseContact(body),
      policies: this.parsePolicies(body),
    };

    const updatedHotel = await this.hotelModel.findByIdAndUpdate(hotelId, updateData, {
      new: true,
    });

    if (!updatedHotel) {
      throw new NotFoundException("Hotel not found");
    }

    if (files && files.length > 0) {
      const updatedImageUrls = await this.cloudinaryService.uploadImages(files);
      updatedHotel.imageUrls = [...updatedImageUrls, ...toArray(body.imageUrls)];
      await updatedHotel.save();
    }

    return updatedHotel;
  }
}
