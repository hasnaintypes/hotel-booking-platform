/**
 * Single source of route paths used by the tests, matching ADR-022. Tests reference paths only
 * through this file so the surface can keep moving without scattering literals.
 */
export const routes = {
  health: "/health/live",
  healthReady: "/health/ready",
  healthDetailed: "/api/v1/admin/system/health",
  auth: {
    register: "/api/v1/auth/register",
    login: "/api/v1/auth/login",
    logout: "/api/v1/auth/logout",
    google: "/api/v1/auth/oauth/google/authorize",
    googleCallback: "/api/v1/auth/oauth/google/callback",
  },
  users: {
    me: "/api/v1/me",
    list: "/api/v1/admin/users",
    role: (id: string) => `/api/v1/admin/users/${id}`,
  },
  hotels: {
    list: "/api/v1/hotels",
    search: "/api/v1/hotels/search",
    byId: (id: string) => `/api/v1/hotels/${id}`,
    adminList: "/api/v1/admin/hotels",
    adminById: (id: string) => `/api/v1/admin/hotels/${id}`,
    active: (id: string) => `/api/v1/admin/hotels/${id}`,
  },
  bookings: {
    list: "/api/v1/admin/bookings",
    myBookings: "/api/v1/bookings",
    create: "/api/v1/bookings",
    paymentIntent: "/api/v1/bookings/payment-intents",
    byId: (id: string) => `/api/v1/bookings/${id}`,
    adminById: (id: string) => `/api/v1/admin/bookings/${id}`,
    cancel: (id: string) => `/api/v1/bookings/${id}/cancellations`,
    adminCancel: (id: string) => `/api/v1/admin/bookings/${id}/cancellations`,
    forHotel: (hotelId: string) => `/api/v1/manage/hotels/${hotelId}/bookings`,
  },
  reviews: {
    create: (bookingId: string) => `/api/v1/bookings/${bookingId}/reviews`,
    list: "/api/v1/admin/reviews",
    byHotel: (hotelId: string) => `/api/v1/hotels/${hotelId}/reviews`,
    summary: (hotelId: string) => `/api/v1/hotels/${hotelId}/rating`,
  },
  insights: {
    dashboard: "/api/v1/admin/reports/overview",
    forecast: "/api/v1/admin/reports/forecast",
    systemStats: "/api/v1/admin/reports/system-stats",
    rollups: "/api/v1/admin/reports/rollups",
  },
  ai: { suggest: "/api/v1/manage/ai/suggestions" },
  myHotels: {
    list: "/api/v1/manage/hotels",
    byId: (id: string) => `/api/v1/manage/hotels/${id}`,
    active: (id: string) => `/api/v1/manage/hotels/${id}/active`,
    images: (id: string) => `/api/v1/manage/hotels/${id}/images`,
    stats: (id: string) => `/api/v1/manage/hotels/${id}/stats`,
  },
  partner: { capabilities: "/api/v1/partner/capabilities" },
} as const;
