import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { HotelType } from "@hotel-booking/types";
import { BOOKING_MODEL, HOTEL_MODEL, USER_MODEL } from "../../database/models";
import { StripeService } from "../../integrations/stripe/stripe.service";
import { IBooking } from "./schemas/booking.schema";
import { CancelBookingDto } from "./dto/cancel-booking.dto";
import { UpdatePaymentDto } from "./dto/update-payment.dto";
import { UpdateStatusDto } from "./dto/update-status.dto";

type AuthorizationResult = {
  ok: boolean;
  status?: number;
  message?: string;
};

const isCancellable = (booking: { status?: string; checkIn: Date }) => {
  const status = booking.status || "pending";
  if (status !== "pending" && status !== "confirmed") return false;
  return new Date(booking.checkIn).getTime() > Date.now();
};

@Injectable()
export class BookingsService {
  constructor(
    @InjectModel(BOOKING_MODEL) private readonly bookingModel: Model<IBooking>,
    @InjectModel(HOTEL_MODEL) private readonly hotelModel: Model<HotelType>,
    @InjectModel(USER_MODEL) private readonly userModel: Model<any>,
    private readonly stripeService: StripeService,
  ) {}

  private async assertCanCancel(booking: IBooking, userId: string): Promise<AuthorizationResult> {
    if (String(booking.userId) === userId) {
      return { ok: true };
    }

    const rawHotelId = booking.hotelId as unknown;
    const hotelId =
      typeof rawHotelId === "object" && rawHotelId !== null
        ? String((rawHotelId as { _id?: string })._id || rawHotelId)
        : String(rawHotelId);

    const hotel = await this.hotelModel.findById(hotelId);
    if (!hotel) {
      return { ok: false, status: 404, message: "Hotel not found" };
    }

    if (hotel.userId === userId) {
      return { ok: true };
    }

    const user = await this.userModel.findById(userId);
    if (user?.role === "admin") {
      return { ok: true };
    }

    return { ok: false, status: 403, message: "Access denied" };
  }

  private async assertOwnerOrAdmin(hotelId: string, userId: string): Promise<AuthorizationResult> {
    const hotel = await this.hotelModel.findById(hotelId);
    if (!hotel) {
      return { ok: false, status: 404, message: "Hotel not found" };
    }

    if (hotel.userId === userId) {
      return { ok: true };
    }

    const user = await this.userModel.findById(userId);
    if (user?.role === "admin") {
      return { ok: true };
    }

    return { ok: false, status: 403, message: "Access denied" };
  }

  private assertAuthorized(result: AuthorizationResult) {
    if (result.ok) return;
    if (result.status === 404) throw new NotFoundException(result.message);
    if (result.status === 403) throw new ForbiddenException(result.message);
    throw new BadRequestException(result.message);
  }

  findAllAdmin() {
    return this.bookingModel
      .find()
      .sort({ createdAt: -1 })
      .populate("hotelId", "name city country");
  }

  async findForHotel(hotelId: string, userId: string) {
    const hotel = await this.hotelModel.findById(hotelId);
    if (!hotel) {
      throw new NotFoundException("Hotel not found");
    }

    if (hotel.userId !== userId) {
      const user = await this.userModel.findById(userId);
      if (user?.role !== "admin") {
        throw new ForbiddenException("Access denied");
      }
    }

    return this.bookingModel
      .find({ hotelId })
      .sort({ createdAt: -1 })
      .populate("userId", "firstName lastName email");
  }

  async cancel(id: string, dto: CancelBookingDto, userId: string) {
    const booking = await this.bookingModel.findById(id);
    if (!booking) {
      throw new NotFoundException("Booking not found");
    }

    this.assertAuthorized(await this.assertCanCancel(booking, userId));

    if (!isCancellable(booking)) {
      throw new BadRequestException(
        "Booking cannot be cancelled (must be upcoming pending/confirmed)",
      );
    }

    const cancellationReason =
      typeof dto?.cancellationReason === "string" ? dto.cancellationReason.trim() : "";

    let refundAmount = 0;
    let refundSkipped: string | undefined;
    const wasPaid = booking.paymentStatus === "paid";

    if (wasPaid && booking.stripePaymentIntentId) {
      try {
        const refund = await this.stripeService.client.refunds.create({
          payment_intent: booking.stripePaymentIntentId,
        });
        refundAmount = typeof refund.amount === "number" ? refund.amount / 100 : booking.totalCost;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Stripe refund failed";
        console.log(error);
        throw new BadGatewayException(message);
      }
    } else if (wasPaid && !booking.stripePaymentIntentId) {
      refundSkipped = "Cancelled without Stripe refund (no payment intent on file)";
    }

    booking.status = "cancelled";
    if (wasPaid && booking.stripePaymentIntentId && refundAmount > 0) {
      booking.paymentStatus = "refunded";
      booking.refundAmount = refundAmount;
    } else if (wasPaid && !booking.stripePaymentIntentId) {
      booking.refundAmount = 0;
    }
    if (cancellationReason) {
      booking.cancellationReason = cancellationReason;
    }
    await booking.save();

    if (wasPaid) {
      await this.hotelModel.findByIdAndUpdate(booking.hotelId, {
        $inc: {
          totalBookings: -1,
          totalRevenue: -(booking.totalCost || 0),
        },
      });
      await this.userModel.findByIdAndUpdate(booking.userId, {
        $inc: {
          totalBookings: -1,
          totalSpent: -(booking.totalCost || 0),
        },
      });
    }

    return { booking, refundAmount, refundSkipped };
  }

  async findOne(id: string, userId: string) {
    const booking = await this.bookingModel
      .findById(id)
      .populate("hotelId", "name city country imageUrls");

    if (!booking) {
      throw new NotFoundException("Booking not found");
    }

    this.assertAuthorized(await this.assertCanCancel(booking, userId));
    return booking;
  }

  async updateStatus(id: string, dto: UpdateStatusDto, userId: string) {
    const existing = await this.bookingModel.findById(id);
    if (!existing) {
      throw new NotFoundException("Booking not found");
    }

    this.assertAuthorized(await this.assertOwnerOrAdmin(existing.hotelId, userId));

    if (dto.status === "cancelled" || dto.status === "refunded") {
      throw new BadRequestException("Use POST /api/bookings/:id/cancel for cancel/refund");
    }

    const updateData: Record<string, unknown> = { status: dto.status };
    if (dto.cancellationReason) {
      updateData.cancellationReason = dto.cancellationReason;
    }

    return this.bookingModel.findByIdAndUpdate(id, updateData, { new: true });
  }

  async updatePayment(id: string, dto: UpdatePaymentDto, userId: string) {
    const existing = await this.bookingModel.findById(id);
    if (!existing) {
      throw new NotFoundException("Booking not found");
    }

    this.assertAuthorized(await this.assertOwnerOrAdmin(existing.hotelId, userId));

    const updateData: Record<string, unknown> = {
      paymentStatus: dto.paymentStatus,
    };
    if (dto.paymentMethod) {
      updateData.paymentMethod = dto.paymentMethod;
    }

    return this.bookingModel.findByIdAndUpdate(id, updateData, { new: true });
  }

  async remove(id: string) {
    const booking = await this.bookingModel.findByIdAndDelete(id);

    if (!booking) {
      throw new NotFoundException("Booking not found");
    }

    const alreadyAdjusted =
      booking.status === "cancelled" ||
      booking.status === "refunded" ||
      booking.paymentStatus === "refunded";

    if (!alreadyAdjusted) {
      await this.hotelModel.findByIdAndUpdate(booking.hotelId, {
        $inc: {
          totalBookings: -1,
          totalRevenue: -(booking.totalCost || 0),
        },
      });

      await this.userModel.findByIdAndUpdate(booking.userId, {
        $inc: {
          totalBookings: -1,
          totalSpent: -(booking.totalCost || 0),
        },
      });
    }

    return { message: "Booking deleted successfully" };
  }

  async myBookings(userId: string) {
    const userBookings = await this.bookingModel.find({ userId }).sort({ createdAt: -1 });

    const results = await Promise.all(
      userBookings.map(async (booking) => {
        const hotel = await this.hotelModel.findById(booking.hotelId);
        if (!hotel) {
          return null;
        }

        return {
          ...hotel.toObject(),
          bookings: [booking.toObject()],
        };
      }),
    );

    return results.filter((result) => result !== null);
  }
}
