import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { bookings } from "./bookings.js";
import { hotels } from "./hotels.js";
import { users } from "./users.js";

/** One review per booking per user, enforced by the database rather than a find-then-insert. */
export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    hotelId: uuid("hotel_id")
      .notNull()
      .references(() => hotels.id, { onDelete: "cascade" }),
    rating: smallint("rating").notNull(),
    comment: text("comment").notNull(),
    cleanliness: smallint("cleanliness").notNull(),
    service: smallint("service").notNull(),
    location: smallint("location").notNull(),
    value: smallint("value").notNull(),
    amenities: smallint("amenities").notNull(),
    isVerified: boolean("is_verified").notNull().default(false),
    helpfulCount: integer("helpful_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    check("reviews_rating_check", sql`${table.rating} between 1 and 5`),
    check("reviews_cleanliness_check", sql`${table.cleanliness} between 1 and 5`),
    check("reviews_service_check", sql`${table.service} between 1 and 5`),
    check("reviews_location_check", sql`${table.location} between 1 and 5`),
    check("reviews_value_check", sql`${table.value} between 1 and 5`),
    check("reviews_amenities_check", sql`${table.amenities} between 1 and 5`),
    check("reviews_comment_check", sql`char_length(${table.comment}) between 1 and 5000`),
    check("reviews_helpful_count_check", sql`${table.helpfulCount} >= 0`),
    uniqueIndex("reviews_booking_user_unique").on(table.bookingId, table.userId),
    index("reviews_hotel_created_at_idx").on(table.hotelId, table.createdAt),
    index("reviews_hotel_rating_idx").on(table.hotelId, table.rating),
    index("reviews_user_created_at_idx").on(table.userId, table.createdAt),
  ],
);

export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;
