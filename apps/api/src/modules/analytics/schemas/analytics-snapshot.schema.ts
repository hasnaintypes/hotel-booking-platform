import mongoose, { Document } from "mongoose";

export interface IAnalytics extends Omit<Document, "_id"> {
  _id: string;
  date: Date;
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
  breakdown: {
    byStatus: {
      pending: number;
      confirmed: number;
      cancelled: number;
      completed: number;
      refunded: number;
    };
    byPaymentStatus: {
      pending: number;
      paid: number;
      failed: number;
      refunded: number;
    };
    byDestination: Array<{
      city: string;
      bookings: number;
      revenue: number;
    }>;
    byHotelType: Array<{
      type: string;
      bookings: number;
      revenue: number;
    }>;
  };
  createdAt: Date;
  updatedAt: Date;
}

export const AnalyticsSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    metrics: {
      totalBookings: { type: Number, default: 0 },
      totalRevenue: { type: Number, default: 0 },
      totalUsers: { type: Number, default: 0 },
      totalHotels: { type: Number, default: 0 },
      averageBookingValue: { type: Number, default: 0 },
      conversionRate: { type: Number, default: 0 },
      cancellationRate: { type: Number, default: 0 },
      averageRating: { type: Number, default: 0 },
    },
    breakdown: {
      byStatus: {
        pending: { type: Number, default: 0 },
        confirmed: { type: Number, default: 0 },
        cancelled: { type: Number, default: 0 },
        completed: { type: Number, default: 0 },
        refunded: { type: Number, default: 0 },
      },
      byPaymentStatus: {
        pending: { type: Number, default: 0 },
        paid: { type: Number, default: 0 },
        failed: { type: Number, default: 0 },
        refunded: { type: Number, default: 0 },
      },
      byDestination: [
        {
          city: String,
          bookings: Number,
          revenue: Number,
        },
      ],
      byHotelType: [
        {
          type: { type: String },
          bookings: { type: Number },
          revenue: { type: Number },
        },
      ],
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  },
);

AnalyticsSchema.index({ date: 1 });
AnalyticsSchema.index({ "metrics.totalRevenue": -1 });

export type AnalyticsDocument = mongoose.HydratedDocument<IAnalytics>;
