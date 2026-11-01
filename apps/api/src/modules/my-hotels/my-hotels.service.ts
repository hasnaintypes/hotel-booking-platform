import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { HotelType } from "@hotel-booking/types";
import { ValidationFailedException } from "../../common/errors/validation-failed.exception";
import {
  assertValidImages,
  HOTEL_MAX_IMAGES,
  IMAGE_FIELD,
} from "../../common/uploads/image-validation";
import { BOOKING_MODEL, HOTEL_MODEL, REVIEW_MODEL } from "../../database/models";
import { CloudinaryService } from "../../integrations/cloudinary/cloudinary.service";
import { IBooking } from "../bookings/schemas/booking.schema";
import { IReview } from "../reviews/schemas/review.schema";
import { HotelFormDto } from "./dto/hotel-form.dto";

/** Multer provides an array of files, or nothing when the request was not multipart. */
const asFileList = (files: unknown): Express.Multer.File[] =>
  Array.isArray(files) ? (files as Express.Multer.File[]) : [];

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
    // The body is already validated. Check the files before anything is uploaded.
    const fileList = asFileList(files);
    assertValidImages(fileList);
    this.assertImageCount(fileList.length);

    const uploaded = await this.cloudinaryService.uploadImages(fileList);

    try {
      const hotel = new this.hotelModel({
        ...this.editableFields(dto),
        imageUrls: uploaded.map((image) => image.url),
        lastUpdated: new Date(),
        userId,
      });
      await hotel.save();
      return hotel;
    } catch (error) {
      await this.cloudinaryService.deleteImages(uploaded.map((image) => image.publicId));
      throw error;
    }
  }

  private assertImageCount(total: number) {
    if (total > HOTEL_MAX_IMAGES) {
      throw new ValidationFailedException([
        { field: IMAGE_FIELD, message: `a hotel can have at most ${HOTEL_MAX_IMAGES} images` },
      ]);
    }
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

    // Images: `imageUrls` lists the existing images to keep (it is absent when the form sent none)
    // and `files` the new ones. Validate everything before uploading.
    const fileList = asFileList(files);
    assertValidImages(fileList);
    const kept = dto.imageUrls;
    const newCount = fileList.length;

    if (kept) {
      const owned = new Set(existingHotel.imageUrls);
      if (kept.some((url) => !owned.has(url))) {
        throw new ValidationFailedException([
          { field: "imageUrls", message: "contains an image that does not belong to this hotel" },
        ]);
      }
    }

    const changesImages = kept !== undefined || newCount > 0;
    if (changesImages) {
      this.assertImageCount((kept?.length ?? 0) + newCount);
    }

    const uploaded = await this.cloudinaryService.uploadImages(fileList);

    try {
      const updatedHotel = await this.hotelModel.findByIdAndUpdate(
        hotelId,
        {
          ...this.editableFields(dto),
          lastUpdated: new Date(),
          ...(changesImages
            ? { imageUrls: [...uploaded.map((image) => image.url), ...(kept ?? [])] }
            : {}),
        },
        { new: true },
      );

      if (!updatedHotel) {
        throw new NotFoundException("Hotel not found");
      }

      return updatedHotel;
    } catch (error) {
      await this.cloudinaryService.deleteImages(uploaded.map((image) => image.publicId));
      throw error;
    }
  }
}
