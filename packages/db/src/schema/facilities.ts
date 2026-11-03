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

/** Controlled vocabulary for guest-facing facilities. */
export const facilities = pgTable(
  "facilities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    category: text("category"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("facilities_code_unique").on(table.code)],
);

export const hotelFacilities = pgTable(
  "hotel_facilities",
  {
    hotelId: uuid("hotel_id")
      .notNull()
      .references(() => hotels.id, { onDelete: "cascade" }),
    facilityId: uuid("facility_id")
      .notNull()
      .references(() => facilities.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.hotelId, table.facilityId] }),
    index("hotel_facilities_facility_idx").on(table.facilityId),
  ],
);

export type Facility = typeof facilities.$inferSelect;
export type NewFacility = typeof facilities.$inferInsert;
export type HotelFacility = typeof hotelFacilities.$inferSelect;
export type NewHotelFacility = typeof hotelFacilities.$inferInsert;
