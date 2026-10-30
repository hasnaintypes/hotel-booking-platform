import mongoose, { Document } from "mongoose";

export interface IBooking extends Omit<Document, "_id"> {
  _id: string;
  userId: string;
  hotelId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  adultCount: number;
  childCount: number;
  checkIn: Date;
  checkOut: Date;
  totalCost: number;
  status: "pending" | "confirmed" | "cancelled" | "completed" | "refunded";
  paymentStatus: "pending" | "paid" | "failed" | "refunded";
  paymentMethod: string;
  specialRequests: string;
  cancellationReason: string;
  refundAmount: number;
  stripePaymentIntentId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const BookingSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    hotelId: { type: String, required: true, index: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, index: true },
    phone: { type: String },
    adultCount: { type: Number, required: true },
    childCount: { type: Number, required: true },
    checkIn: { type: Date, required: true, index: true },
    checkOut: { type: Date, required: true },
    totalCost: { type: Number, required: true },
    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled", "completed", "refunded"],
      default: "pending",
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
      index: true,
    },
    paymentMethod: { type: String },
    specialRequests: { type: String },
    cancellationReason: { type: String },
    refundAmount: { type: Number, default: 0 },
    stripePaymentIntentId: { type: String, index: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  },
);

BookingSchema.index({ userId: 1, createdAt: -1 });
BookingSchema.index({ hotelId: 1, checkIn: 1 });
BookingSchema.index({ status: 1, createdAt: -1 });
BookingSchema.index({ paymentStatus: 1, createdAt: -1 });
BookingSchema.index({ checkIn: 1, status: 1 });

export type BookingDocument = mongoose.HydratedDocument<IBooking>;
