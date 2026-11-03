import {
  check,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { hotels } from "./hotels.js";

/** Ordered gallery images; replaces the embedded `imageUrls` array. */
export const hotelImages = pgTable(
  "hotel_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hotelId: uuid("hotel_id")
      .notNull()
      .references(() => hotels.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    altText: text("alt_text"),
    position: smallint("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    check("hotel_images_position_check", sql`${table.position} >= 0`),
    uniqueIndex("hotel_images_hotel_url_unique").on(table.hotelId, table.url),
    uniqueIndex("hotel_images_hotel_position_unique").on(table.hotelId, table.position),
    index("hotel_images_hotel_idx").on(table.hotelId),
  ],
);

export type HotelImage = typeof hotelImages.$inferSelect;
export type NewHotelImage = typeof hotelImages.$inferInsert;
