import { z } from "zod";
import { entered, httpUrl, toList, toNumber, toOptionalList, trimmedText } from "./body";
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

/** The contact and policy fields an owner may set, as the flat keys the form posts. */
const hotelFormContactAndPolicies = {
  "contact.phone": entered(z.string().max(30)),
  "contact.email": entered(z.email().max(254)),
  "contact.website": entered(httpUrl.max(2048)),
  "policies.checkInTime": entered(z.string().max(50)),
  "policies.checkOutTime": entered(z.string().max(50)),
  "policies.cancellationPolicy": entered(z.string().max(1000)),
  "policies.petPolicy": entered(z.string().max(1000)),
  "policies.smokingPolicy": entered(z.string().max(1000)),
};

/**
 * `POST /api/v1/manage/hotels` and `PATCH /api/v1/manage/hotels/:hotelId`.
 *
 * The body is flat: contact and policy fields keep their dotted keys, numbers may arrive as text,
 * and a single value where a list is expected means a one-item list. Anything else in the request
 * (isFeatured, totalRevenue, averageRating, isActive, userId, ...) is stripped and can never reach
 * the database.
 */
export const hotelFormRequestSchema = z.object({
  name: trimmedText(100, 1),
  city: trimmedText(100, 1),
  country: trimmedText(100, 1),
  description: trimmedText(5000, 1),
  type: z.preprocess(
    toList,
    z.array(z.string().max(50)).min(1, { error: "select at least one hotel type" }).max(10),
  ),
  facilities: z.preprocess(
    toList,
    z.array(z.string().max(50)).min(1, { error: "select at least one facility" }).max(50),
  ),
  pricePerNight: z.preprocess(toNumber, z.number().min(0.01).max(100_000)),
  starRating: z.preprocess(toNumber, z.number().int().min(1).max(5)),
  adultCount: z.preprocess(toNumber, z.number().int().min(1).max(50)),
  childCount: z.preprocess(toNumber, z.number().int().min(0).max(50)),
  /** Images the owner keeps when editing; new uploads arrive as files on their own route. */
  imageUrls: z.preprocess(toOptionalList, z.array(httpUrl.max(2048)).max(6).optional()),
  ...hotelFormContactAndPolicies,
});

/** `PATCH /api/v1/manage/hotels/:id/active` and `PATCH /api/v1/admin/hotels/:id`. */
export const toggleActiveRequestSchema = z.object({
  isActive: z.boolean({ error: "isActive boolean required" }),
});

/** `DELETE /api/v1/manage/hotels/:id/images`: the stored URL to forget. */
export const removeHotelImageRequestSchema = z.object({
  url: z.string().min(1, { error: "url required" }),
});

export type HotelFormRequest = z.infer<typeof hotelFormRequestSchema>;
export type ToggleActiveRequest = z.infer<typeof toggleActiveRequestSchema>;
export type RemoveHotelImageRequest = z.infer<typeof removeHotelImageRequestSchema>;
