export type BusinessInsightsRollup = {
  _id: string;
  date: string | Date;
  metrics: {
    totalBookings: number;
    totalRevenue: number;
    totalUsers: number;
    totalHotels: number;
    averageBookingValue: number;
    conversionRate: number;
    cancellationRate: number;
    averageRating: number;
  };
};

/** @deprecated Prefer BusinessInsightsRollup */
export type AnalyticsSnapshot = BusinessInsightsRollup;
