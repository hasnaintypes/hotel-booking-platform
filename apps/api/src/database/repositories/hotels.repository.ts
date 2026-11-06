import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, inArray, lte, type SQL, sql } from "drizzle-orm";
import {
  facilities,
  hotelFacilities,
  hotelHotelTypes,
  hotelImages,
  hotels,
  hotelTypes,
  withTransaction,
  type Database,
  type Hotel,
  type Transaction,
} from "@hotel-booking/db";
import { throwPostgresError } from "../../common/errors/postgres-errors";
import { countryCodeFor } from "../../common/utils/country-code";
import { isUuid } from "../../common/utils/uuid";
import { DATABASE } from "../postgres.database";

export type HotelRelations = {
  images: string[];
  facilities: string[];
  types: string[];
};

export type HotelRecord = Hotel & HotelRelations;

export type HotelWriteInput = {
  name: string;
  city: string;
  country: string;
  countryCode?: string;
  description: string;
  type: string[];
  facilities: string[];
  pricePerNight: number;
  starRating: number;
  adultCount: number;
  childCount: number;
  contact?: {
    phone?: string;
    email?: string;
    website?: string;
  };
  policies?: {
    checkInTime?: string;
    checkOutTime?: string;
    cancellationPolicy?: string;
    petPolicy?: string;
    smokingPolicy?: string;
  };
  imageUrls?: string[];
};

export type HotelSearchFilters = {
  destination?: string;
  adultCount?: number;
  childCount?: number;
  facilities?: string[];
  types?: string[];
  stars?: number[];
  maxPrice?: number;
  sortOption?: "starRating" | "pricePerNightAsc" | "pricePerNightDesc";
  page?: number;
  pageSize?: number;
};

/** The route-level page size; callers cannot ask for more than the hard cap below. */
export const HOTEL_SEARCH_PAGE_SIZE = 5;
export const HOTEL_LIST_LIMIT = 500;

const slug = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const uniqueNames = (values: string[]) => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = trimmed.toLowerCase();
    if (trimmed && !seen.has(key)) {
      seen.add(key);
      result.push(trimmed);
    }
  }
  return result;
};

const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");

@Injectable()
export class HotelsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findById(id: string): Promise<HotelRecord | undefined> {
    if (!isUuid(id)) return undefined;
    const [row] = await this.db.select().from(hotels).where(eq(hotels.id, id)).limit(1);
    if (!row) return undefined;
    const [record] = await this.withRelations([row]);
    return record;
  }

  async findOwnedById(id: string, ownerUserId: string): Promise<HotelRecord | undefined> {
    if (!isUuid(id)) return undefined;
    const [row] = await this.db
      .select()
      .from(hotels)
      .where(and(eq(hotels.id, id), eq(hotels.ownerUserId, ownerUserId)))
      .limit(1);
    if (!row) return undefined;
    const [record] = await this.withRelations([row]);
    return record;
  }

  async findByOwner(ownerUserId: string): Promise<HotelRecord[]> {
    const rows = await this.db
      .select()
      .from(hotels)
      .where(eq(hotels.ownerUserId, ownerUserId))
      .orderBy(desc(hotels.updatedAt), asc(hotels.id));
    return this.withRelations(rows);
  }

  async listActive(): Promise<HotelRecord[]> {
    const rows = await this.db
      .select()
      .from(hotels)
      .where(eq(hotels.status, "active"))
      .orderBy(desc(hotels.updatedAt), asc(hotels.id))
      .limit(HOTEL_LIST_LIMIT);
    return this.withRelations(rows);
  }

  async listAll(): Promise<HotelRecord[]> {
    const rows = await this.db
      .select()
      .from(hotels)
      .orderBy(desc(hotels.updatedAt), asc(hotels.id))
      .limit(HOTEL_LIST_LIMIT);
    return this.withRelations(rows);
  }

  /** A bounded catalogue sample for admin fallback aggregates. */
  async listForMetrics(): Promise<Hotel[]> {
    return this.db.select().from(hotels).orderBy(asc(hotels.id)).limit(HOTEL_LIST_LIMIT);
  }

  async findByIds(ids: string[]): Promise<HotelRecord[]> {
    const unique = [...new Set(ids.filter(isUuid))];
    if (unique.length === 0) return [];
    const rows = await this.db.select().from(hotels).where(inArray(hotels.id, unique));
    return this.withRelations(rows);
  }

  async count(): Promise<number> {
    const [row] = await this.db.select({ count: sql<number>`count(*)::int` }).from(hotels);
    return Number(row?.count ?? 0);
  }

  async starCounts(): Promise<Array<{ starRating: number; count: number }>> {
    const rows = await this.db
      .select({ starRating: hotels.starRating, count: sql<number>`count(*)::int` })
      .from(hotels)
      .groupBy(hotels.starRating)
      .orderBy(asc(hotels.starRating));
    return rows.map((row) => ({ starRating: row.starRating, count: Number(row.count) }));
  }

  async search(filters: HotelSearchFilters) {
    const pageSize = Math.min(filters.pageSize ?? HOTEL_SEARCH_PAGE_SIZE, 100);
    const page = Math.max(1, filters.page ?? 1);

    const conditions = this.searchConditions(filters);
    const where = and(...conditions);

    const orderBy = this.searchOrder(filters.sortOption);
    const rows = await this.db
      .select()
      .from(hotels)
      .where(where)
      .orderBy(...orderBy)
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const [countRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(hotels)
      .where(where);

    const total = Number(countRow?.count ?? 0);
    return {
      data: await this.withRelations(rows),
      pagination: {
        total,
        page,
        pages: Math.ceil(total / pageSize),
      },
    };
  }

  private searchConditions(filters: HotelSearchFilters): SQL[] {
    const conditions: SQL[] = [eq(hotels.status, "active")];

    const destination = filters.destination?.trim();
    if (destination) {
      const pattern = `%${escapeLike(destination.toLowerCase())}%`;
      conditions.push(
        sql`(lower(${hotels.city}) like ${pattern} escape '\\' or lower(${hotels.country}) like ${pattern} escape '\\')`,
      );
    }

    if (filters.adultCount !== undefined) {
      conditions.push(sql`${hotels.adultCount} >= ${filters.adultCount}`);
    }
    if (filters.childCount !== undefined) {
      conditions.push(sql`${hotels.childCount} >= ${filters.childCount}`);
    }

    for (const name of uniqueNames(filters.facilities ?? [])) {
      conditions.push(sql`exists (
        select 1
        from ${hotelFacilities} hf
        inner join ${facilities} f on f.id = hf.facility_id
        where hf.hotel_id = ${hotels.id} and lower(f.name) = lower(${name})
      )`);
    }

    const types = uniqueNames(filters.types ?? []);
    if (types.length > 0) {
      const typeMatches = types.map(
        (name) => sql`exists (
          select 1
          from ${hotelHotelTypes} hht
          inner join ${hotelTypes} ht on ht.id = hht.hotel_type_id
          where hht.hotel_id = ${hotels.id} and lower(ht.name) = lower(${name})
        )`,
      );
      conditions.push(sql`(${sql.join(typeMatches, sql` or `)})`);
    }

    if (filters.stars?.length) {
      conditions.push(inArray(hotels.starRating, filters.stars));
    }

    if (filters.maxPrice !== undefined) {
      conditions.push(lte(hotels.pricePerNightMinor, Math.round(filters.maxPrice * 100)));
    }

    return conditions;
  }

  private searchOrder(sortOption?: HotelSearchFilters["sortOption"]) {
    switch (sortOption) {
      case "starRating":
        return [desc(hotels.starRating), asc(hotels.id)];
      case "pricePerNightAsc":
        return [asc(hotels.pricePerNightMinor), asc(hotels.id)];
      case "pricePerNightDesc":
        return [desc(hotels.pricePerNightMinor), asc(hotels.id)];
      default:
        return [desc(hotels.updatedAt), asc(hotels.id)];
    }
  }

  async create(input: HotelWriteInput, ownerUserId: string): Promise<string> {
    try {
      return await withTransaction(this.db, async (tx) => {
        const [row] = await tx
          .insert(hotels)
          .values({
            source: "managed",
            ownerUserId,
            createdByUserId: ownerUserId,
            name: input.name,
            description: input.description,
            city: input.city,
            country: input.country,
            countryCode: (input.countryCode ?? countryCodeFor(input.country)).toUpperCase(),
            starRating: input.starRating,
            pricePerNightMinor: Math.round(input.pricePerNight * 100),
            currencyCode: "GBP",
            status: "active",
            adultCount: input.adultCount,
            childCount: input.childCount,
            contactPhone: input.contact?.phone ?? null,
            contactEmail: input.contact?.email ?? null,
            contactWebsite: input.contact?.website ?? null,
            checkInTime: input.policies?.checkInTime ?? null,
            checkOutTime: input.policies?.checkOutTime ?? null,
            cancellationPolicy: input.policies?.cancellationPolicy ?? null,
            petPolicy: input.policies?.petPolicy ?? null,
            smokingPolicy: input.policies?.smokingPolicy ?? null,
          })
          .returning({ id: hotels.id });

        await this.replaceImages(tx, row.id, input.imageUrls ?? []);
        await this.replaceFacilities(tx, row.id, input.facilities);
        await this.replaceTypes(tx, row.id, input.type);
        return row.id;
      });
    } catch (error) {
      return throwPostgresError(error);
    }
  }

  async update(
    id: string,
    ownerUserId: string,
    input: HotelWriteInput,
  ): Promise<string | undefined> {
    try {
      return await withTransaction(this.db, async (tx) => {
        const [row] = await tx
          .update(hotels)
          .set({
            name: input.name,
            description: input.description,
            city: input.city,
            country: input.country,
            countryCode: (input.countryCode ?? countryCodeFor(input.country)).toUpperCase(),
            starRating: input.starRating,
            pricePerNightMinor: Math.round(input.pricePerNight * 100),
            adultCount: input.adultCount,
            childCount: input.childCount,
            contactPhone: input.contact?.phone ?? null,
            contactEmail: input.contact?.email ?? null,
            contactWebsite: input.contact?.website ?? null,
            checkInTime: input.policies?.checkInTime ?? null,
            checkOutTime: input.policies?.checkOutTime ?? null,
            cancellationPolicy: input.policies?.cancellationPolicy ?? null,
            petPolicy: input.policies?.petPolicy ?? null,
            smokingPolicy: input.policies?.smokingPolicy ?? null,
            updatedAt: new Date(),
          })
          .where(and(eq(hotels.id, id), eq(hotels.ownerUserId, ownerUserId)))
          .returning({ id: hotels.id });

        if (!row) return undefined;

        if (input.imageUrls !== undefined) {
          await this.replaceImages(tx, id, input.imageUrls);
        }
        await this.replaceFacilities(tx, id, input.facilities);
        await this.replaceTypes(tx, id, input.type);
        return row.id;
      });
    } catch (error) {
      return throwPostgresError(error);
    }
  }

  async setStatus(
    id: string,
    isActive: boolean,
    ownerUserId?: string,
  ): Promise<HotelRecord | undefined> {
    if (!isUuid(id)) return undefined;
    const [row] = await this.db
      .update(hotels)
      .set({ status: isActive ? "active" : "inactive", updatedAt: new Date() })
      .where(
        ownerUserId
          ? and(eq(hotels.id, id), eq(hotels.ownerUserId, ownerUserId))
          : eq(hotels.id, id),
      )
      .returning();
    if (!row) return undefined;
    const [record] = await this.withRelations([row]);
    return record;
  }

  async addImages(id: string, urls: string[]): Promise<void> {
    const existing = await this.db
      .select({ url: hotelImages.url })
      .from(hotelImages)
      .where(eq(hotelImages.hotelId, id))
      .orderBy(asc(hotelImages.position));
    await withTransaction(this.db, async (tx) => {
      await this.replaceImages(tx, id, [...urls, ...existing.map((image) => image.url)]);
    });
  }

  async removeImage(id: string, url: string): Promise<void> {
    const existing = await this.db
      .select({ url: hotelImages.url })
      .from(hotelImages)
      .where(eq(hotelImages.hotelId, id))
      .orderBy(asc(hotelImages.position));
    await withTransaction(this.db, async (tx) => {
      await this.replaceImages(
        tx,
        id,
        existing.map((image) => image.url).filter((current) => current !== url),
      );
    });
  }

  async imageUrls(id: string): Promise<string[]> {
    const rows = await this.db
      .select({ url: hotelImages.url })
      .from(hotelImages)
      .where(eq(hotelImages.hotelId, id))
      .orderBy(asc(hotelImages.position));
    return rows.map((row) => row.url);
  }

  private async replaceImages(tx: Transaction, hotelId: string, urls: string[]) {
    await tx.delete(hotelImages).where(eq(hotelImages.hotelId, hotelId));
    const unique = [...new Set(urls)];
    if (unique.length === 0) return;
    await tx.insert(hotelImages).values(
      unique.map((url, position) => ({
        hotelId,
        url,
        position,
      })),
    );
  }

  private async replaceFacilities(tx: Transaction, hotelId: string, names: string[]) {
    await tx.delete(hotelFacilities).where(eq(hotelFacilities.hotelId, hotelId));
    const ids = await this.resolveFacilities(tx, names);
    if (ids.length === 0) return;
    await tx
      .insert(hotelFacilities)
      .values(ids.map((facilityId) => ({ hotelId, facilityId })))
      .onConflictDoNothing();
  }

  private async replaceTypes(tx: Transaction, hotelId: string, names: string[]) {
    await tx.delete(hotelHotelTypes).where(eq(hotelHotelTypes.hotelId, hotelId));
    const ids = await this.resolveTypes(tx, names);
    if (ids.length === 0) return;
    await tx
      .insert(hotelHotelTypes)
      .values(ids.map((hotelTypeId) => ({ hotelId, hotelTypeId })))
      .onConflictDoNothing();
  }

  private async resolveFacilities(tx: Transaction, names: string[]): Promise<string[]> {
    const wanted = uniqueNames(names);
    if (wanted.length === 0) return [];
    const lowerNames = wanted.map((name) => name.toLowerCase());
    const existing = await tx
      .select()
      .from(facilities)
      .where(inArray(sql`lower(${facilities.name})`, lowerNames));
    const byName = new Map(existing.map((row) => [row.name.toLowerCase(), row.id]));

    for (const name of wanted) {
      if (byName.has(name.toLowerCase())) continue;
      const code = slug(name) || "facility";
      const [created] = await tx
        .insert(facilities)
        .values({ code, name })
        .onConflictDoNothing({ target: facilities.code })
        .returning();
      if (created) {
        byName.set(name.toLowerCase(), created.id);
        continue;
      }
      const [byCode] = await tx.select().from(facilities).where(eq(facilities.code, code)).limit(1);
      if (byCode) byName.set(name.toLowerCase(), byCode.id);
    }

    return wanted
      .map((name) => byName.get(name.toLowerCase()))
      .filter((id): id is string => typeof id === "string");
  }

  private async resolveTypes(tx: Transaction, names: string[]): Promise<string[]> {
    const wanted = uniqueNames(names);
    if (wanted.length === 0) return [];
    const lowerNames = wanted.map((name) => name.toLowerCase());
    const existing = await tx
      .select()
      .from(hotelTypes)
      .where(inArray(sql`lower(${hotelTypes.name})`, lowerNames));
    const byName = new Map(existing.map((row) => [row.name.toLowerCase(), row.id]));

    for (const name of wanted) {
      if (byName.has(name.toLowerCase())) continue;
      const code = slug(name) || "hotel";
      const [created] = await tx
        .insert(hotelTypes)
        .values({ code, name })
        .onConflictDoNothing({ target: hotelTypes.code })
        .returning();
      if (created) {
        byName.set(name.toLowerCase(), created.id);
        continue;
      }
      const [byCode] = await tx.select().from(hotelTypes).where(eq(hotelTypes.code, code)).limit(1);
      if (byCode) byName.set(name.toLowerCase(), byCode.id);
    }

    return wanted
      .map((name) => byName.get(name.toLowerCase()))
      .filter((id): id is string => typeof id === "string");
  }

  private async withRelations(rows: Hotel[]): Promise<HotelRecord[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const [images, facilityRows, typeRows] = await Promise.all([
      this.db
        .select({ hotelId: hotelImages.hotelId, url: hotelImages.url })
        .from(hotelImages)
        .where(inArray(hotelImages.hotelId, ids))
        .orderBy(asc(hotelImages.position), asc(hotelImages.createdAt)),
      this.db
        .select({ hotelId: hotelFacilities.hotelId, name: facilities.name })
        .from(hotelFacilities)
        .innerJoin(facilities, eq(facilities.id, hotelFacilities.facilityId))
        .where(inArray(hotelFacilities.hotelId, ids))
        .orderBy(asc(facilities.name)),
      this.db
        .select({ hotelId: hotelHotelTypes.hotelId, name: hotelTypes.name })
        .from(hotelHotelTypes)
        .innerJoin(hotelTypes, eq(hotelTypes.id, hotelHotelTypes.hotelTypeId))
        .where(inArray(hotelHotelTypes.hotelId, ids))
        .orderBy(asc(hotelTypes.name)),
    ]);

    const imagesByHotel = new Map<string, string[]>();
    for (const image of images) {
      const list = imagesByHotel.get(image.hotelId) ?? [];
      list.push(image.url);
      imagesByHotel.set(image.hotelId, list);
    }

    const facilitiesByHotel = new Map<string, string[]>();
    for (const facility of facilityRows) {
      const list = facilitiesByHotel.get(facility.hotelId) ?? [];
      list.push(facility.name);
      facilitiesByHotel.set(facility.hotelId, list);
    }

    const typesByHotel = new Map<string, string[]>();
    for (const type of typeRows) {
      const list = typesByHotel.get(type.hotelId) ?? [];
      list.push(type.name);
      typesByHotel.set(type.hotelId, list);
    }

    return rows.map((row) => ({
      ...row,
      images: imagesByHotel.get(row.id) ?? [],
      facilities: facilitiesByHotel.get(row.id) ?? [],
      types: typesByHotel.get(row.id) ?? [],
    }));
  }
}
