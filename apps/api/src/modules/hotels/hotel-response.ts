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

type HotelLocation = {
  latitude: number;
  longitude: number;
  address: {
    street: string;
    city: string;
    state: string;
    country: string;
    zipCode: string;
  };
};

type HotelContact = {
  phone: string;
  email: string;
  website: string;
};

type HotelPolicies = {
  checkInTime: string;
  checkOutTime: string;
  cancellationPolicy: string;
  petPolicy: string;
  smokingPolicy: string;
};

/** Fields every anonymous or signed-in customer may see. */
export type PublicHotelResponse = {
  _id: string;
  name: string;
  city: string;
  country: string;
  description: string;
  type: string[];
  adultCount: number;
  childCount: number;
  facilities: string[];
  pricePerNight: number;
  starRating: number;
  imageUrls: string[];
  lastUpdated: Date;
  location?: HotelLocation;
  contact: HotelContact;
  policies: HotelPolicies;
  averageRating: number;
  reviewCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export type PublicHotelSearchResponse = {
  data: PublicHotelResponse[];
  pagination: {
    total: number;
    page: number;
    pages: number;
  };
};

/** Public fields plus the owner's own counters and listing controls. */
export type ManageHotelResponse = PublicHotelResponse & {
  userId: string;
  totalBookings: number;
  totalRevenue: number;
  upcomingBookings?: number;
  completedBookings?: number;
  cancelledBookings?: number;
  occupancyRate: number;
  isActive: boolean;
  isFeatured: boolean;
};

/** Owner fields plus internal ownership and moderation fields. */
export type AdminHotelResponse = ManageHotelResponse & {
  ownerUserId: string | null;
  createdByUserId: string | null;
  organisationId: string | null;
  source: HotelRecord["source"];
  status: HotelRecord["status"];
};

const withBaseFields = (
  hotel: HotelRecord,
  stats: HotelStats,
): Omit<PublicHotelResponse, "location"> => {
  return {
    _id: hotel.id,
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
    averageRating: stats.averageRating,
    reviewCount: stats.reviewCount,
    createdAt: hotel.createdAt,
    updatedAt: hotel.updatedAt,
  };
};

const withLocation = (hotel: HotelRecord): Pick<PublicHotelResponse, "location"> => {
  if (hotel.latitude === null || hotel.longitude === null) return {};
  return {
    location: {
      latitude: Number(hotel.latitude),
      longitude: Number(hotel.longitude),
      address: {
        street: hotel.addressLine1 ?? "",
        city: hotel.city,
        state: hotel.state ?? "",
        country: hotel.country,
        zipCode: hotel.postalCode ?? "",
      },
    },
  };
};

/** Public and customer allow-list: no owner identity, financial counters or internal flags. */
export function toPublicHotelResponse(
  hotel: HotelRecord,
  stats = EMPTY_HOTEL_STATS,
): PublicHotelResponse {
  return {
    ...withBaseFields(hotel, stats),
    ...withLocation(hotel),
  };
}

/** Owner allow-list: adds the viewer's own ownership, counters and listing state. */
export function toManageHotelResponse(
  hotel: HotelRecord,
  stats = EMPTY_HOTEL_STATS,
): ManageHotelResponse {
  return {
    ...toPublicHotelResponse(hotel, stats),
    userId: hotel.ownerUserId ?? hotel.createdByUserId ?? "",
    totalBookings: stats.totalBookings,
    totalRevenue: stats.totalRevenue,
    occupancyRate: 0,
    isActive: hotel.status === "active",
    isFeatured: hotel.isFeatured,
  };
}

/** Admin allow-list: owner fields plus internal ownership and moderation fields. */
export function toAdminHotelResponse(
  hotel: HotelRecord,
  stats = EMPTY_HOTEL_STATS,
): AdminHotelResponse {
  return {
    ...toManageHotelResponse(hotel, stats),
    ownerUserId: hotel.ownerUserId,
    createdByUserId: hotel.createdByUserId,
    organisationId: hotel.organisationId,
    source: hotel.source,
    status: hotel.status,
  };
}
