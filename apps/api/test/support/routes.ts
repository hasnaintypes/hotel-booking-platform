/**
 * Single source of route paths used by the tests. The API is moving to the
 * versioned route map (ADR-022); tests reference paths only through this file
 * so the same assertions keep validating behaviour after each module moves.
 */
export const routes = {
  health: "/api/health",
  healthDetailed: "/api/health/detailed",
  auth: {
    register: "/api/users/register",
    login: "/api/auth/login",
    logout: "/api/auth/logout",
    validateToken: "/api/auth/validate-token",
  },
  users: {
    me: "/api/users/me",
    list: "/api/users",
    role: (id: string) => `/api/users/${id}/role`,
  },
  hotels: {
    list: "/api/hotels",
    search: "/api/hotels/search",
    byId: (id: string) => `/api/hotels/${id}`,
    paymentIntent: (id: string) => `/api/hotels/${id}/bookings/payment-intent`,
    bookings: (id: string) => `/api/hotels/${id}/bookings`,
  },
  ai: { suggest: "/api/ai/suggest" },
  myHotels: {
    list: "/api/my-hotels",
    byId: (id: string) => `/api/my-hotels/${id}`,
  },
} as const;
