import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { adminHotelSchema, type CursorPage } from "@hotel-booking/contracts";
import { PreconditionFailedException } from "../../common/errors/precondition-failed.exception";
import { ifMatchSatisfied, representationEtag } from "../../common/http/etag";
import { anchorOf, pageOf, pageSize } from "../../common/pagination/cursor-page";
import { readNumberCursor, readTimestampCursor } from "../../common/pagination/sorted-cursor";
import { AuthenticatedUser } from "../../common/types/jwt-payload.interface";
import { HotelsRepository, type HotelRecord } from "../../database/repositories/hotels.repository";
import { UsersRepository } from "../../database/repositories/users.repository";
import {
  AdminHotelListQueryDto,
  HotelSearchQueryDto,
  PublicHotelListQueryDto,
} from "./dto/hotel.dto";
import { ToggleActiveDto } from "./dto/toggle-active.dto";
import {
  toAdminHotelResponse,
  toPublicHotelResponse,
  type AdminHotelResponse,
  type PublicHotelResponse,
} from "./hotel-response";
import { HotelStatsService } from "./hotel-stats.service";

/** Cursor scopes: a tag minted for one list or sort is rejected by every other one. */
const SCOPE = {
  publicList: "hotels:list",
  adminList: "hotels:admin",
  search: (sortOption?: string) => `hotels:search:${sortOption ?? "updatedAt"}`,
} as const;

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

  async search(query: HotelSearchQueryDto): Promise<CursorPage<PublicHotelResponse>> {
    const limit = pageSize(query);
    const scope = SCOPE.search(query.sortOption);
    const numericSort =
      query.sortOption === "starRating" ||
      query.sortOption === "pricePerNightAsc" ||
      query.sortOption === "pricePerNightDesc";

    const rows = await this.hotels.searchPage(
      {
        destination: query.destination,
        adultCount: query.adultCount,
        childCount: query.childCount,
        facilities: query.facilities,
        types: query.types,
        stars: query.stars,
        maxPrice: query.maxPrice,
        sortOption: query.sortOption,
      },
      {
        limit,
        cursor: numericSort
          ? readNumberCursor(query.cursor, scope)
          : readTimestampCursor(query.cursor, scope),
      },
    );

    const page = pageOf(rows, limit, scope, anchorOf);
    return { data: await this.enrich(page.data), pageInfo: page.pageInfo };
  }

  /** Guests and owners see active hotels; administrators use the admin list. */
  async findAll(query: PublicHotelListQueryDto): Promise<CursorPage<PublicHotelResponse>> {
    const limit = pageSize(query);
    const rows = await this.hotels.listActivePage(
      {
        city: query.city,
        country: query.country,
        stars: query.stars,
        maxPrice: query.maxPrice,
      },
      { limit, cursor: readTimestampCursor(query.cursor, SCOPE.publicList) },
    );

    const page = pageOf(rows, limit, SCOPE.publicList, anchorOf);
    return { data: await this.enrich(page.data), pageInfo: page.pageInfo };
  }

  async findAllAdmin(query: AdminHotelListQueryDto): Promise<CursorPage<AdminHotelResponse>> {
    const limit = pageSize(query);
    const rows = await this.hotels.listAllPage(
      { status: query.status, q: query.q },
      { limit, cursor: readTimestampCursor(query.cursor, SCOPE.adminList) },
    );

    const page = pageOf(rows, limit, SCOPE.adminList, anchorOf);
    return { data: await this.enrichAdmin(page.data), pageInfo: page.pageInfo };
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
      // The ETag must cover the bytes the client receives, and `ZodSerializerInterceptor` returns
      // a new object in schema order. Hash the parsed representation so `If-Match` stays in step
      // with `GET /admin/hotels/:id`, which serialises through the same schema.
      if (
        !ifMatchSatisfied(
          options.ifMatch,
          representationEtag(adminHotelSchema.parse(representation)),
        )
      ) {
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
