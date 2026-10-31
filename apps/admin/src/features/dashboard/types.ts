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

export type InsightsOverview = {
  totalHotels?: number;
  totalUsers?: number;
  totalBookings?: number;
  totalRevenue?: number | string;
};

export type InsightsDashboard = {
  overview?: InsightsOverview;
};
