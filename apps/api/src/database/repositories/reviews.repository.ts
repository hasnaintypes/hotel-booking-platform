import { Inject, Injectable } from "@nestjs/common";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { reviews, type Database, type NewReview, type Review } from "@hotel-booking/db";
import { throwPostgresError } from "../../common/errors/postgres-errors";
import { isUuid } from "../../common/utils/uuid";
import { DATABASE } from "../postgres.database";

export type ReviewRecord = Review;

export type ReviewSummary = {
  averageRating: number;
  reviewCount: number;
};

export const REVIEW_LIST_LIMIT = 200;

const clampLimit = (value: number, fallback: number) => {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.floor(value), REVIEW_LIST_LIMIT);
};

/** Review storage. Rating summaries are derived from rows rather than written back to hotels. */
@Injectable()
export class ReviewsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listAdmin(limit = 100): Promise<Review[]> {
    return this.db
      .select()
      .from(reviews)
      .orderBy(desc(reviews.createdAt), desc(reviews.id))
      .limit(clampLimit(limit, 100));
  }

  async listByHotel(hotelId: string, limit = 100): Promise<Review[]> {
    if (!isUuid(hotelId)) return [];
    return this.db
      .select()
      .from(reviews)
      .where(eq(reviews.hotelId, hotelId))
      .orderBy(desc(reviews.createdAt), desc(reviews.id))
      .limit(clampLimit(limit, 100));
  }

  async summary(hotelId: string): Promise<ReviewSummary> {
    if (!isUuid(hotelId)) return { averageRating: 0, reviewCount: 0 };
    const [row] = await this.db
      .select({
        averageRating: sql<number>`coalesce(avg(${reviews.rating}), 0)::float`,
        reviewCount: sql<number>`count(*)::int`,
      })
      .from(reviews)
      .where(eq(reviews.hotelId, hotelId));

    return {
      averageRating: Math.round((Number(row?.averageRating) || 0) * 10) / 10,
      reviewCount: Number(row?.reviewCount) || 0,
    };
  }

  /** Rating summaries for a bounded set of hotels in one query. */
  async summaryForHotels(hotelIds: string[]): Promise<Map<string, ReviewSummary>> {
    const ids = [...new Set(hotelIds.filter(isUuid))];
    const result = new Map<string, ReviewSummary>();
    if (ids.length === 0) return result;

    const rows = await this.db
      .select({
        hotelId: reviews.hotelId,
        averageRating: sql<number>`coalesce(avg(${reviews.rating}), 0)::float`,
        reviewCount: sql<number>`count(*)::int`,
      })
      .from(reviews)
      .where(inArray(reviews.hotelId, ids))
      .groupBy(reviews.hotelId);

    for (const row of rows) {
      result.set(row.hotelId, {
        averageRating: Math.round(Number(row.averageRating) * 10) / 10,
        reviewCount: Number(row.reviewCount),
      });
    }
    return result;
  }

  async create(input: NewReview): Promise<Review> {
    try {
      const [review] = await this.db.insert(reviews).values(input).returning();
      return review;
    } catch (error) {
      return throwPostgresError(error);
    }
  }
}
