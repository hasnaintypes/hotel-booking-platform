import { pgEnum } from "drizzle-orm/pg-core";

/** Account role. Membership-based organisation permissions arrive in M1-16 (#101). */
export const userRole = pgEnum("user_role", ["user", "admin"]);

/** Account lifecycle. Accounts are suspended, not hard-deleted. */
export const userStatus = pgEnum("user_status", ["active", "suspended"]);

/** Whether a hotel is directly managed or derived from supplier inventory. */
export const hotelSource = pgEnum("hotel_source", ["managed", "supplier"]);

/** Listing lifecycle. `inactive` keeps the row while hiding it from search. */
export const hotelStatus = pgEnum("hotel_status", ["draft", "active", "inactive", "archived"]);

/** Booking lifecycle carried over from the current API contract. */
export const bookingStatus = pgEnum("booking_status", [
  "pending",
  "confirmed",
  "cancelled",
  "completed",
]);
