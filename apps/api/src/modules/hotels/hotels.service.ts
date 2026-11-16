import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PreconditionFailedException } from "../../common/errors/precondition-failed.exception";
import { ifMatchSatisfied, representationEtag } from "../../common/http/etag";
import { AuthenticatedUser } from "../../common/types/jwt-payload.interface";
import { HotelsRepository, type HotelRecord } from "../../database/repositories/hotels.repository";
import { UsersRepository } from "../../database/repositories/users.repository";
import { HotelSearchQueryDto } from "./dto/hotel.dto";
import { ToggleActiveDto } from "./dto/toggle-active.dto";
import {
  toAdminHotelResponse,
  toPublicHotelResponse,
  type AdminHotelResponse,
  type PublicHotelResponse,
  type PublicHotelSearchResponse,
} from "./hotel-response";
import { HotelStatsService } from "./hotel-stats.service";

@Injectable()
export class HotelsService {
  constructor(
    private readonly hotels: HotelsRepository,
    private readonly hotelStats: HotelStatsService,
    private readonly users: UsersRepository,
  ) {}

  private async isAdmin(userId?: string): Promise<boolean> {
    if (!userId) return false;
    const user = await this.users.findById(userId);
    return user?.role === "admin";
  }

  private async enrich(records: HotelRecord[]): Promise<PublicHotelResponse[]> {
    const stats = await this.hotelStats.forHotels(records.map((hotel) => hotel.id));
    return records.map((hotel) => toPublicHotelResponse(hotel, stats.get(hotel.id)));
  }

  private async enrichAdmin(records: HotelRecord[]): Promise<AdminHotelResponse[]> {
    const stats = await this.hotelStats.forHotels(records.map((hotel) => hotel.id));
    return records.map((hotel) => toAdminHotelResponse(hotel, stats.get(hotel.id)));
  }

  private async enrichOne(hotel: HotelRecord): Promise<PublicHotelResponse> {
    return toPublicHotelResponse(hotel, await this.hotelStats.forHotel(hotel.id));
  }

  private async enrichOneAdmin(hotel: HotelRecord): Promise<AdminHotelResponse> {
    return toAdminHotelResponse(hotel, await this.hotelStats.forHotel(hotel.id));
  }

  async search(queryParams: HotelSearchQueryDto): Promise<PublicHotelSearchResponse> {
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
    return this.hotels.listAll().then((records) => this.enrichAdmin(records));
  }

  async setActive(id: string, dto: ToggleActiveDto, options: { ifMatch?: string } = {}) {
    // ToggleActiveDto already guarantees a boolean. Checked again here so that a caller that
    // bypasses the DTO can never write anything but a boolean into the update.
    const isActive: unknown = dto.isActive;
    if (typeof isActive !== "boolean") {
      throw new BadRequestException("isActive boolean required");
    }

    // A conditional update compares the caller's tag with the representation they would have
    // received from GET /admin/hotels/:id, before anything is written.
    if (options.ifMatch !== undefined) {
      const current = await this.hotels.findById(id);
      if (!current) {
        throw new NotFoundException("Hotel not found");
      }
      const representation = toAdminHotelResponse(current, await this.hotelStats.forHotel(id));
      if (!ifMatchSatisfied(options.ifMatch, representationEtag(representation))) {
        throw new PreconditionFailedException();
      }
    }

    const hotel = await this.hotels.setStatus(id, isActive);
    if (!hotel) {
      throw new NotFoundException("Hotel not found");
    }

    return this.enrichOneAdmin(hotel);
  }

  /** An inactive hotel is visible only to its owner and to admins; everyone else gets a 404. */
  async findOne(id: string, viewer?: AuthenticatedUser): Promise<PublicHotelResponse> {
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

  async findOneAdmin(id: string): Promise<AdminHotelResponse> {
    const hotel = await this.hotels.findById(id);
    if (!hotel) {
      throw new NotFoundException("Hotel not found");
    }
    return this.enrichOneAdmin(hotel);
  }
}
