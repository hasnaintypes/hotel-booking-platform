import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { hotels } from "./hotels.js";

/** Controlled vocabulary for hotel categories (hotel, villa, apartment, ...). */
export const hotelTypes = pgTable(
  "hotel_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("hotel_types_code_unique").on(table.code)],
);

export const hotelHotelTypes = pgTable(
  "hotel_hotel_types",
  {
    hotelId: uuid("hotel_id")
      .notNull()
      .references(() => hotels.id, { onDelete: "cascade" }),
    hotelTypeId: uuid("hotel_type_id")
      .notNull()
      .references(() => hotelTypes.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.hotelId, table.hotelTypeId] }),
    index("hotel_hotel_types_type_idx").on(table.hotelTypeId),
  ],
);

export type HotelTypeRow = typeof hotelTypes.$inferSelect;
export type NewHotelTypeRow = typeof hotelTypes.$inferInsert;
export type HotelHotelType = typeof hotelHotelTypes.$inferSelect;
export type NewHotelHotelType = typeof hotelHotelTypes.$inferInsert;
