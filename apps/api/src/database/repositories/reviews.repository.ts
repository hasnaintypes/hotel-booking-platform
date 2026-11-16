import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, type SQL, sql } from "drizzle-orm";
import { reviews, type Database, type NewReview, type Review } from "@hotel-booking/db";
import { throwPostgresError } from "../../common/errors/postgres-errors";
import type { CursorRow } from "../../common/pagination/cursor-page";
import { afterDesc, timestampCursorKey } from "../../common/pagination/cursor-sql";
import { isUuid } from "../../common/utils/uuid";
import { DATABASE } from "../postgres.database";

export type ReviewRecord = Review;

export type ReviewSummary = {
  averageRating: number;
  reviewCount: number;
};

export type ReviewListFilters = {
  hotelId?: string;
  rating?: number;
};

/** A page request: how many rows, and where the previous page stopped. */
export type ReviewPageParams = {
  limit: number;
  cursor?: { key: string; id: string };
};

/** Review storage. Rating summaries are derived from rows rather than written back to hotels. */
@Injectable()
export class ReviewsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** One cursor page of reviews, newest first; filters are applied in SQL. */
  async listPage(
    filters: ReviewListFilters,
    params: ReviewPageParams,
  ): Promise<CursorRow<Review>[]> {
    const conditions: SQL[] = [];
    if (filters.hotelId) {
      if (!isUuid(filters.hotelId)) return [];
      conditions.push(eq(reviews.hotelId, filters.hotelId));
    }
    if (filters.rating !== undefined) {
      conditions.push(eq(reviews.rating, filters.rating));
    }
    if (params.cursor) {
      conditions.push(afterDesc(reviews.createdAt, reviews.id, params.cursor, "timestamptz"));
    }

    const rows = await this.db
      .select({ review: reviews, cursorKey: timestampCursorKey(reviews.createdAt) })
      .from(reviews)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(reviews.createdAt), desc(reviews.id))
      .limit(params.limit + 1);

    return rows.map(({ review, cursorKey }) => ({ ...review, cursorKey }));
  }

  async listByHotelPage(hotelId: string, params: ReviewPageParams): Promise<CursorRow<Review>[]> {
    if (!isUuid(hotelId)) return [];
    return this.listPage({ hotelId }, params);
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
