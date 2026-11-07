import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export type AnalyticsStatusBreakdown = {
  pending_payment: number;
  authorized: number;
  confirming: number;
  confirmed: number;
  cancelling: number;
  cancelled: number;
  failed: number;
  expired: number;
  needs_review: number;
};

export type AnalyticsPaymentBreakdown = {
  pending: number;
  paid: number;
  failed: number;
  refunded: number;
};

export type AnalyticsDestinationTotal = {
  city: string;
  bookings: number;
  revenueMinor: number;
};

export type AnalyticsHotelTypeTotal = {
  type: string;
  bookings: number;
  revenueMinor: number;
};

/**
 * Persisted business-insights rollups. Every metric is computed from the live tables when a
 * snapshot is captured; the snapshot then keeps the historical values without mutable counters.
 */
export const analyticsSnapshots = pgTable(
  "analytics_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    date: timestamp("date", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    totalBookings: integer("total_bookings").notNull(),
    totalRevenueMinor: bigint("total_revenue_minor", { mode: "number" }).notNull(),
    totalUsers: integer("total_users").notNull(),
    totalHotels: integer("total_hotels").notNull(),
    averageBookingValueMinor: integer("average_booking_value_minor").notNull(),
    cancellationRate: doublePrecision("cancellation_rate").notNull(),
    averageRating: doublePrecision("average_rating").notNull(),
    byStatus: jsonb("by_status")
      .$type<AnalyticsStatusBreakdown>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    byPaymentStatus: jsonb("by_payment_status")
      .$type<AnalyticsPaymentBreakdown>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    byDestination: jsonb("by_destination")
      .$type<AnalyticsDestinationTotal[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    byHotelType: jsonb("by_hotel_type")
      .$type<AnalyticsHotelTypeTotal[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    check("analytics_snapshots_total_bookings_check", sql`${table.totalBookings} >= 0`),
    check("analytics_snapshots_total_revenue_check", sql`${table.totalRevenueMinor} >= 0`),
    check(
      "analytics_snapshots_average_booking_value_check",
      sql`${table.averageBookingValueMinor} >= 0`,
    ),
    check(
      "analytics_snapshots_cancellation_rate_check",
      sql`${table.cancellationRate} between 0 and 100`,
    ),
    check("analytics_snapshots_average_rating_check", sql`${table.averageRating} between 0 and 5`),
    index("analytics_snapshots_date_idx").on(table.date),
  ],
);

export type AnalyticsSnapshot = typeof analyticsSnapshots.$inferSelect;
export type NewAnalyticsSnapshot = typeof analyticsSnapshots.$inferInsert;
