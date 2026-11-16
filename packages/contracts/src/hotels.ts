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

export type HotelLocation = z.infer<typeof hotelLocationSchema>;
export type HotelContact = z.infer<typeof hotelContactSchema>;
export type HotelPolicies = z.infer<typeof hotelPoliciesSchema>;
export type PublicHotel = z.infer<typeof publicHotelSchema>;
export type HotelSearchQuery = z.infer<typeof hotelSearchQuerySchema>;
export type HotelSearchResponse = z.infer<typeof hotelSearchResponseSchema>;
export type HotelSearchSortOption = (typeof HOTEL_SEARCH_SORT_OPTIONS)[number];
