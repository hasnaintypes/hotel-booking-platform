import { z } from "zod";
import { BOOKING_STATUS_VALUES } from "./bookings";
import { cursorPageQuerySchema } from "./pagination";
import { USER_ROLE_VALUES, USER_STATUS_VALUES } from "./users";
import {
  optionalQueryEnum,
  optionalQueryInt,
  optionalQueryIntList,
  optionalQueryString,
  optionalQueryUuid,
} from "./query";

/**
 * Query schemas for every list endpoint.
 *
 * Each one extends the shared cursor query, so `limit` (1–100, default 20) and `cursor` are defined
 * once, and an endpoint only states its own filters. The filter vocabularies live here rather than
 * being imported from the database package: they are part of the API contract, and a migration that
 * adds a state must be a deliberate contract change.
 */
export const HOTEL_STATUS_VALUES = ["draft", "active", "inactive", "archived"] as const;
export const DISCREPANCY_STATUS_VALUES = ["open", "resolved", "ignored"] as const;
export const DISCREPANCY_KIND_VALUES = [
  "payment_status_mismatch",
  "payment_amount_mismatch",
  "refund_mismatch",
  "local_without_provider",
  "provider_missing",
  "provider_without_local",
  "ledger_mismatch",
] as const;

/** `GET /api/v1/hotels` — the public catalogue. */
export const publicHotelListQuerySchema = cursorPageQuerySchema.extend({
  city: optionalQueryString(100),
  country: optionalQueryString(100),
  stars: optionalQueryIntList(5, 1, 5),
  maxPrice: optionalQueryInt(0, 1_000_000),
});

/** `GET /api/v1/admin/hotels` — every listing, including drafts and archived rows. */
export const adminHotelListQuerySchema = cursorPageQuerySchema.extend({
  status: optionalQueryEnum(HOTEL_STATUS_VALUES),
  q: optionalQueryString(120),
});

/** `GET /api/v1/hotels/:hotelId/reviews`. */
export const hotelReviewListQuerySchema = cursorPageQuerySchema;

/** `GET /api/v1/bookings` — the signed-in guest's own bookings. */
export const myBookingListQuerySchema = cursorPageQuerySchema;

/** `GET /api/v1/manage/hotels/:hotelId/bookings`. */
export const hotelBookingListQuerySchema = cursorPageQuerySchema;

/** `GET /api/v1/admin/bookings` — the admin queue. */
export const adminBookingListQuerySchema = cursorPageQuerySchema.extend({
  status: optionalQueryEnum(BOOKING_STATUS_VALUES),
  hotelId: optionalQueryUuid(),
  q: optionalQueryString(120),
});

/** `GET /api/v1/admin/users`. */
export const adminUserListQuerySchema = cursorPageQuerySchema.extend({
  role: optionalQueryEnum(USER_ROLE_VALUES),
  status: optionalQueryEnum(USER_STATUS_VALUES),
  q: optionalQueryString(120),
});

/** `GET /api/v1/admin/reviews`. */
export const adminReviewListQuerySchema = cursorPageQuerySchema.extend({
  hotelId: optionalQueryUuid(),
  rating: optionalQueryInt(1, 5),
});

/** `GET /api/v1/admin/reconciliation/discrepancies`. */
export const discrepancyListQuerySchema = cursorPageQuerySchema.extend({
  status: optionalQueryEnum(DISCREPANCY_STATUS_VALUES),
  kind: optionalQueryEnum(DISCREPANCY_KIND_VALUES),
  assignedToUserId: optionalQueryUuid(),
});

/** `GET /api/v1/admin/reports/rollups`. */
export const rollupListQuerySchema = cursorPageQuerySchema;

/** `GET /api/v1/manage/hotels` — the signed-in owner's hotels. */
export const myHotelListQuerySchema = cursorPageQuerySchema;

export type PublicHotelListQuery = z.infer<typeof publicHotelListQuerySchema>;
export type AdminHotelListQuery = z.infer<typeof adminHotelListQuerySchema>;
export type HotelReviewListQuery = z.infer<typeof hotelReviewListQuerySchema>;
export type MyBookingListQuery = z.infer<typeof myBookingListQuerySchema>;
export type HotelBookingListQuery = z.infer<typeof hotelBookingListQuerySchema>;
export type AdminBookingListQuery = z.infer<typeof adminBookingListQuerySchema>;
export type AdminUserListQuery = z.infer<typeof adminUserListQuerySchema>;
export type AdminReviewListQuery = z.infer<typeof adminReviewListQuerySchema>;
export type DiscrepancyListQuery = z.infer<typeof discrepancyListQuerySchema>;
export type RollupListQuery = z.infer<typeof rollupListQuerySchema>;
export type MyHotelListQuery = z.infer<typeof myHotelListQuerySchema>;
