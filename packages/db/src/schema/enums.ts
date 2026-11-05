import { pgEnum } from "drizzle-orm/pg-core";

/** Account role. Organisation permissions come from memberships, not from this enum. */
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
  "refunded",
]);

/** Where the booked inventory came from. Managed rows belong to a hotel we operate. */
export const inventorySource = pgEnum("inventory_source", ["managed", "supplier"]);

/** Payment lifecycle. `paid` is the captured state; refunds add separate rows. */
export const paymentStatus = pgEnum("payment_status", [
  "pending",
  "authorized",
  "paid",
  "failed",
  "refunded",
]);

/** Ledger entry kinds. Payable/settlement are reserved for future settlement models. */
export const ledgerEntryType = pgEnum("ledger_entry_type", [
  "charge",
  "refund",
  "fee",
  "adjustment",
  "payable",
  "settlement",
]);

export type UserRole = (typeof userRole.enumValues)[number];
export type UserStatus = (typeof userStatus.enumValues)[number];
export type HotelSource = (typeof hotelSource.enumValues)[number];
export type HotelStatus = (typeof hotelStatus.enumValues)[number];
export type BookingStatus = (typeof bookingStatus.enumValues)[number];
export type InventorySource = (typeof inventorySource.enumValues)[number];
export type PaymentStatus = (typeof paymentStatus.enumValues)[number];
export type LedgerEntryType = (typeof ledgerEntryType.enumValues)[number];
