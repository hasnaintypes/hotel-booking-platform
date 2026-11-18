import { z } from "zod";
import { uuidSchema, isoDateTimeSchema } from "./primitives";
import { cursorPageQuerySchema, cursorPageSchema } from "./pagination";
import {
  optionalQueryEnum,
  optionalQueryInt,
  optionalQueryIntList,
  optionalQueryString,
  optionalQueryStringList,
} from "./query";

/** Sort orders accepted by `GET /api/v1/hotels/search`. */
export const HOTEL_SEARCH_SORT_OPTIONS = [
  "starRating",
  "pricePerNightAsc",
  "pricePerNightDesc",
] as const;

const addressSchema = z.object({
  street: z.string(),
  city: z.string(),
  state: z.string(),
  country: z.string(),
  zipCode: z.string(),
});

export const hotelLocationSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  address: addressSchema,
});

export const hotelContactSchema = z.object({
  phone: z.string(),
  email: z.string(),
  website: z.string(),
});

export const hotelPoliciesSchema = z.object({
  checkInTime: z.string(),
  checkOutTime: z.string(),
  cancellationPolicy: z.string(),
  petPolicy: z.string(),
  smokingPolicy: z.string(),
});

/** Listing lifecycle, shared by the admin list filter and the admin hotel response. */
export const HOTEL_STATUS_VALUES = ["draft", "active", "inactive", "archived"] as const;
/** Where the listing comes from; supplier rows have no owner or creator. */
export const HOTEL_SOURCE_VALUES = ["managed", "supplier"] as const;
export const hotelStatusSchema = z.enum(HOTEL_STATUS_VALUES);
export const hotelSourceSchema = z.enum(HOTEL_SOURCE_VALUES);

/** The customer-visible hotel shape; owner identity and internal fields are never included. */
export const publicHotelSchema = z.object({
  _id: uuidSchema,
  name: z.string(),
  city: z.string(),
  country: z.string(),
  description: z.string(),
  type: z.array(z.string()),
  adultCount: z.number().int(),
  childCount: z.number().int(),
  facilities: z.array(z.string()),
  pricePerNight: z.number(),
  starRating: z.number(),
  imageUrls: z.array(z.string()),
  lastUpdated: isoDateTimeSchema,
  location: hotelLocationSchema.optional(),
  contact: hotelContactSchema,
  policies: hotelPoliciesSchema,
  averageRating: z.number(),
  reviewCount: z.number().int(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

/** `GET /api/v1/hotels/search` query parameters. */
export const hotelSearchQuerySchema = cursorPageQuerySchema.extend({
  destination: optionalQueryString(100),
  adultCount: optionalQueryInt(0, 50),
  childCount: optionalQueryInt(0, 50),
  facilities: optionalQueryStringList(30, 50),
  types: optionalQueryStringList(30, 50),
  stars: optionalQueryIntList(5, 1, 5),
  maxPrice: optionalQueryInt(0, 1_000_000),
  sortOption: optionalQueryEnum(HOTEL_SEARCH_SORT_OPTIONS),
});

/** A cursor page of public hotels, shared by the catalogue and search responses. */
export const publicHotelPageSchema = cursorPageSchema(publicHotelSchema);

export const hotelSearchResponseSchema = publicHotelPageSchema;

/** Owner view: public fields plus ownership, counters and listing controls. */
export const manageHotelSchema = publicHotelSchema.extend({
  /** `ownerUserId ?? createdByUserId ?? ""` — supplier rows can have neither. */
  userId: z.string(),
  totalBookings: z.number().int(),
  /** Major units; the repository divides `totalAmountMinor` by 100. */
  totalRevenue: z.number(),
  upcomingBookings: z.number().int().optional(),
  completedBookings: z.number().int().optional(),
  cancelledBookings: z.number().int().optional(),
  occupancyRate: z.number(),
  isActive: z.boolean(),
  isFeatured: z.boolean(),
});

/** The owner's list row: the same fields, with the dashboard counts always present. */
export const manageHotelListItemSchema = manageHotelSchema.extend({
  upcomingBookings: z.number().int(),
  completedBookings: z.number().int(),
  cancelledBookings: z.number().int(),
});

export const manageHotelPageSchema = cursorPageSchema(manageHotelListItemSchema);

/** Admin view: owner fields plus internal ownership and moderation fields. */
export const adminHotelSchema = manageHotelSchema.extend({
  ownerUserId: uuidSchema.nullable(),
  createdByUserId: uuidSchema.nullable(),
  organisationId: uuidSchema.nullable(),
  source: hotelSourceSchema,
  status: hotelStatusSchema,
});

export const adminHotelPageSchema = cursorPageSchema(adminHotelSchema);

/** `GET /api/v1/manage/hotels/:id/stats`. */
export const hotelStatsSchema = z.object({
  totalBookings: z.number().int(),
  totalRevenue: z.number(),
  averageRating: z.number(),
  reviewCount: z.number().int(),
});

export type HotelLocation = z.infer<typeof hotelLocationSchema>;
export type HotelContact = z.infer<typeof hotelContactSchema>;
export type HotelPolicies = z.infer<typeof hotelPoliciesSchema>;
export type PublicHotel = z.infer<typeof publicHotelSchema>;
export type HotelSearchQuery = z.infer<typeof hotelSearchQuerySchema>;
export type HotelSearchResponse = z.infer<typeof hotelSearchResponseSchema>;
export type HotelSearchSortOption = (typeof HOTEL_SEARCH_SORT_OPTIONS)[number];
export type ManageHotel = z.infer<typeof manageHotelSchema>;
export type ManageHotelListItem = z.infer<typeof manageHotelListItemSchema>;
export type ManageHotelPage = z.infer<typeof manageHotelPageSchema>;
export type AdminHotel = z.infer<typeof adminHotelSchema>;
export type AdminHotelPage = z.infer<typeof adminHotelPageSchema>;
export type HotelStats = z.infer<typeof hotelStatsSchema>;
