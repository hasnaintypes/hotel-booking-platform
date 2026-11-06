import { Injectable, NotFoundException } from "@nestjs/common";
import { ValidationFailedException } from "../../common/errors/validation-failed.exception";
import {
  assertValidImages,
  HOTEL_MAX_IMAGES,
  IMAGE_FIELD,
} from "../../common/uploads/image-validation";
import {
  HotelsRepository,
  type HotelWriteInput,
} from "../../database/repositories/hotels.repository";
import { CloudinaryService } from "../../integrations/cloudinary/cloudinary.service";
import { toHotelResponse } from "../hotels/hotel-response";
import { HotelStatsService } from "../hotels/hotel-stats.service";
import { HotelFormDto } from "./dto/hotel-form.dto";

const asFileList = (files: unknown): Express.Multer.File[] =>
  Array.isArray(files) ? (files as Express.Multer.File[]) : [];

const editableFields = (dto: HotelFormDto): HotelWriteInput => ({
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
});

@Injectable()
export class MyHotelsService {
  constructor(
    private readonly hotels: HotelsRepository,
    private readonly hotelStats: HotelStatsService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  private assertImageCount(total: number) {
    if (total > HOTEL_MAX_IMAGES) {
      throw new ValidationFailedException([
        { field: IMAGE_FIELD, message: `a hotel can have at most ${HOTEL_MAX_IMAGES} images` },
      ]);
    }
  }

  private async owned(hotelId: string, userId: string) {
    const hotel = await this.hotels.findOwnedById(hotelId, userId);
    if (!hotel) {
      throw new NotFoundException("Hotel not found");
    }
    return hotel;
  }

  async create(dto: HotelFormDto, userId: string) {
    const id = await this.hotels.create(
      { ...editableFields(dto), imageUrls: dto.imageUrls ?? [] },
      userId,
    );
    const hotel = await this.owned(id, userId);
    return toHotelResponse(hotel);
  }

  async findAll(userId: string) {
    const hotels = await this.hotels.findByOwner(userId);
    if (hotels.length === 0) return [];

    const ids = hotels.map((hotel) => hotel.id);
    const [stats, counts] = await Promise.all([
      this.hotelStats.forHotels(ids),
      this.hotelStats.ownerBookingCounts(ids),
    ]);

    return hotels.map((hotel) => ({
      ...toHotelResponse(hotel, stats.get(hotel.id)),
      upcomingBookings: counts.get(hotel.id)?.upcomingBookings ?? 0,
      completedBookings: counts.get(hotel.id)?.completedBookings ?? 0,
      cancelledBookings: counts.get(hotel.id)?.cancelledBookings ?? 0,
    }));
  }

  async findOne(id: string, userId: string) {
    const hotel = await this.owned(id, userId);
    return toHotelResponse(hotel, await this.hotelStats.forHotel(hotel.id));
  }

  async setActive(id: string, isActive: boolean, userId: string) {
    const hotel = await this.hotels.setStatus(id, isActive, userId);
    if (!hotel) {
      throw new NotFoundException("Hotel not found");
    }
    return toHotelResponse(hotel, await this.hotelStats.forHotel(hotel.id));
  }

  async stats(id: string, userId: string) {
    await this.owned(id, userId);
    return this.hotelStats.forHotel(id);
  }

  async update(hotelId: string, dto: HotelFormDto, userId: string) {
    const existing = await this.owned(hotelId, userId);

    if (dto.imageUrls !== undefined) {
      const ownedUrls = new Set(existing.images);
      if (dto.imageUrls.some((url) => !ownedUrls.has(url))) {
        throw new ValidationFailedException([
          { field: "imageUrls", message: "contains an image that does not belong to this hotel" },
        ]);
      }
      this.assertImageCount(dto.imageUrls.length);
    }

    const input = editableFields(dto);
    if (dto.imageUrls !== undefined) {
      input.imageUrls = dto.imageUrls;
    }
    await this.hotels.update(hotelId, userId, input);

    const updated = await this.owned(hotelId, userId);
    return toHotelResponse(updated, await this.hotelStats.forHotel(updated.id));
  }

  async addImages(hotelId: string, files: Express.Multer.File[], userId: string) {
    const existing = await this.owned(hotelId, userId);
    const fileList = asFileList(files);
    assertValidImages(fileList);
    this.assertImageCount(existing.images.length + fileList.length);

    const uploaded = await this.cloudinaryService.uploadImages(fileList);

    try {
      await this.hotels.addImages(
        hotelId,
        uploaded.map((image) => image.url),
      );
    } catch (error) {
      await this.cloudinaryService.deleteImages(uploaded.map((image) => image.publicId));
      throw error;
    }

    const updated = await this.owned(hotelId, userId);
    return toHotelResponse(updated, await this.hotelStats.forHotel(updated.id));
  }

  async removeImage(hotelId: string, url: string, userId: string) {
    const existing = await this.owned(hotelId, userId);
    if (!existing.images.includes(url)) {
      throw new ValidationFailedException([
        { field: "url", message: "image does not belong to this hotel" },
      ]);
    }

    await this.hotels.removeImage(hotelId, url);
    const updated = await this.owned(hotelId, userId);
    return toHotelResponse(updated, await this.hotelStats.forHotel(updated.id));
  }
}
