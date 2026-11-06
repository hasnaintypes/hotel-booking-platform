import type { HotelType } from "@hotel-booking/types";
import type { HotelRecord } from "../../database/repositories/hotels.repository";

export type HotelStats = {
  totalBookings: number;
  totalRevenue: number;
  averageRating: number;
  reviewCount: number;
};

export const EMPTY_HOTEL_STATS: HotelStats = {
  totalBookings: 0,
  totalRevenue: 0,
  averageRating: 0,
  reviewCount: 0,
};

/** Maps the canonical PostgreSQL row to the response shape the existing SPAs consume. */
export function toHotelResponse(hotel: HotelRecord, stats = EMPTY_HOTEL_STATS): HotelType {
  const latitude = hotel.latitude === null ? null : Number(hotel.latitude);
  const longitude = hotel.longitude === null ? null : Number(hotel.longitude);

  return {
    _id: hotel.id,
    userId: hotel.ownerUserId ?? hotel.createdByUserId ?? "",
    name: hotel.name,
    city: hotel.city,
    country: hotel.country,
    description: hotel.description,
    type: hotel.types,
    adultCount: hotel.adultCount,
    childCount: hotel.childCount,
    facilities: hotel.facilities,
    pricePerNight: hotel.pricePerNightMinor / 100,
    starRating: hotel.starRating,
    imageUrls: hotel.images,
    lastUpdated: hotel.updatedAt,
    ...(latitude !== null && longitude !== null
      ? {
          location: {
            latitude,
            longitude,
            address: {
              street: hotel.addressLine1 ?? "",
              city: hotel.city,
              state: hotel.state ?? "",
              country: hotel.country,
              zipCode: hotel.postalCode ?? "",
            },
          },
        }
      : {}),
    contact: {
      phone: hotel.contactPhone ?? "",
      email: hotel.contactEmail ?? "",
      website: hotel.contactWebsite ?? "",
    },
    policies: {
      checkInTime: hotel.checkInTime ?? "",
      checkOutTime: hotel.checkOutTime ?? "",
      cancellationPolicy: hotel.cancellationPolicy ?? "",
      petPolicy: hotel.petPolicy ?? "",
      smokingPolicy: hotel.smokingPolicy ?? "",
    },
    totalBookings: stats.totalBookings,
    totalRevenue: stats.totalRevenue,
    averageRating: stats.averageRating,
    reviewCount: stats.reviewCount,
    occupancyRate: 0,
    isActive: hotel.status === "active",
    isFeatured: hotel.isFeatured,
    createdAt: hotel.createdAt,
    updatedAt: hotel.updatedAt,
  };
}
