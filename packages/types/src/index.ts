export type HotelType = {
  _id: string;
  userId: string;
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

  // New fields
  location?: {
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
  contact?: {
    phone: string;
    email: string;
    website: string;
  };
  policies?: {
    checkInTime: string;
    checkOutTime: string;
    cancellationPolicy: string;
    petPolicy: string;
    smokingPolicy: string;
  };
  amenities?: {
    parking: boolean;
    wifi: boolean;
    pool: boolean;
    gym: boolean;
    spa: boolean;
    restaurant: boolean;
    bar: boolean;
    airportShuttle: boolean;
    businessCenter: boolean;
  };
  totalBookings?: number;
  totalRevenue?: number;
  averageRating?: number;
  reviewCount?: number;
  /** Owner dashboard counts (enriched by GET /api/v1/manage/hotels) */
  upcomingBookings?: number;
  completedBookings?: number;
  cancelledBookings?: number;
  occupancyRate?: number;
  isActive?: boolean;
  isFeatured?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};

/** Paging metadata that accompanies a page of items. */
export type PageInfo = {
  /** Opaque cursor for the next page, or null when this is the last page. */
  nextCursor: string | null;
  /** True when at least one more row exists after this page. */
  hasMore: boolean;
};

/** The envelope every v1 list endpoint returns. */
export type CursorPage<T> = {
  data: T[];
  pageInfo: PageInfo;
};

/** Query accepted by every list endpoint. `cursor` is opaque and scoped to one list and sort. */
export type ListQuery = {
  limit?: number;
  cursor?: string;
};

/** `GET /api/v1/hotels/search` returns one cursor page of public hotels. */
export type HotelSearchResponse = CursorPage<HotelType>;

export { bookingStatusLabel, isBookingCancellable } from "./booking";
