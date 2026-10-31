export const authKeys = {
  all: ["auth"] as const,
  currentUser: () => [...authKeys.all, "currentUser"] as const,
};

export const hotelKeys = {
  all: ["hotels"] as const,
  search: (params: Record<string, unknown>) => [...hotelKeys.all, "search", params] as const,
  home: () => [...hotelKeys.all, "home"] as const,
  detail: (hotelId: string) => [...hotelKeys.all, "detail", hotelId] as const,
  mineDetail: (hotelId: string) => [...hotelKeys.all, "mineDetail", hotelId] as const,
  reviews: (hotelId: string) => [...hotelKeys.all, "reviews", hotelId] as const,
  mine: () => [...hotelKeys.all, "mine"] as const,
  bookings: (hotelId: string) => [...hotelKeys.all, "bookings", hotelId] as const,
};

export const bookingKeys = {
  all: ["bookings"] as const,
  mine: () => [...bookingKeys.all, "mine"] as const,
  paymentIntent: (hotelId: string, nights: string) =>
    [...bookingKeys.all, "paymentIntent", hotelId, nights] as const,
};

export const analyticsKeys = {
  all: ["analytics"] as const,
  dashboard: () => [...analyticsKeys.all, "dashboard"] as const,
  forecast: () => [...analyticsKeys.all, "forecast"] as const,
  ops: () => [...analyticsKeys.all, "ops"] as const,
};
