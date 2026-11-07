import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { FieldError } from "../../common/errors/problem";
import { ValidationFailedException } from "../../common/errors/validation-failed.exception";
import { BookingsRepository } from "../../database/repositories/bookings.repository";
import { HotelsRepository, type HotelRecord } from "../../database/repositories/hotels.repository";
import { UsersRepository } from "../../database/repositories/users.repository";
import { StripeService } from "../../integrations/stripe/stripe.service";
import { toPublicHotelResponse } from "../hotels/hotel-response";
import { toBookingResponse, type BookingResponse } from "./booking-response";
import { CancelBookingDto } from "./dto/cancel-booking.dto";
import { CreateBookingDto } from "./dto/create-booking.dto";
import { PaymentIntentDto } from "./dto/payment-intent.dto";

const DAY_MS = 24 * 60 * 60 * 1000;

const isCancellable = (booking: { status: string; checkIn: Date }) => {
  if (booking.status !== "pending" && booking.status !== "confirmed") return false;
  return booking.checkIn.getTime() > Date.now();
};

type AuthorizationResult = {
  ok: boolean;
  status?: number;
  message?: string;
};

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly bookings: BookingsRepository,
    private readonly hotels: HotelsRepository,
    private readonly users: UsersRepository,
    private readonly stripeService: StripeService,
    private readonly config: ConfigService,
  ) {}

  private get maxNights(): number {
    return this.config.get<number>("booking.maxNights") ?? 30;
  }

  /**
   * Rules that depend on the hotel or on today's date. Field formats are checked earlier by
   * CreateBookingDto. Check-in may be one day before today (UTC) so a guest in a time zone ahead
   * of UTC can still book "today".
   */
  private validateStay(
    dto: CreateBookingDto,
    hotel: Pick<HotelRecord, "adultCount" | "childCount">,
  ) {
    const errors: FieldError[] = [];
    const checkIn = new Date(dto.checkIn).getTime();
    const checkOut = new Date(dto.checkOut).getTime();

    const startOfTodayUtc = new Date().setUTCHours(0, 0, 0, 0);
    if (checkIn < startOfTodayUtc - DAY_MS) {
      errors.push({ field: "checkIn", message: "check-in cannot be in the past" });
    }

    if (checkOut <= checkIn) {
      errors.push({ field: "checkOut", message: "check-out must be after check-in" });
    } else if (Math.ceil((checkOut - checkIn) / DAY_MS) > this.maxNights) {
      errors.push({
        field: "checkOut",
        message: `a stay cannot exceed ${this.maxNights} nights`,
      });
    }

    if (dto.adultCount > hotel.adultCount) {
      errors.push({
        field: "adultCount",
        message: `this hotel allows at most ${hotel.adultCount} adults`,
      });
    }
    if (dto.childCount > hotel.childCount) {
      errors.push({
        field: "childCount",
        message: `this hotel allows at most ${hotel.childCount} children`,
      });
    }

    if (errors.length > 0) {
      throw new ValidationFailedException(errors);
    }
  }

  private async assertCanAccess(
    booking: { ownerUserId: string; hotelId: string },
    userId: string,
  ): Promise<AuthorizationResult> {
    if (booking.ownerUserId === userId) {
      return { ok: true };
    }

    const hotel = await this.hotels.findById(booking.hotelId);
    if (!hotel) {
      return { ok: false, status: 404, message: "Hotel not found" };
    }

    if (hotel.ownerUserId === userId) {
      return { ok: true };
    }

    const user = await this.users.findById(userId);
    if (user?.role === "admin") {
      return { ok: true };
    }

    return { ok: false, status: 403, message: "Access denied" };
  }

  private async assertOwnerOrAdmin(hotelId: string, userId: string) {
    const hotel = await this.hotels.findById(hotelId);
    if (!hotel) {
      throw new NotFoundException("Hotel not found");
    }

    if (hotel.ownerUserId === userId) return;

    const user = await this.users.findById(userId);
    if (user?.role !== "admin") {
      throw new ForbiddenException("Access denied");
    }
  }

  private assertAuthorized(result: AuthorizationResult) {
    if (result.ok) return;
    if (result.status === 404) throw new NotFoundException(result.message);
    if (result.status === 403) throw new ForbiddenException(result.message);
    throw new BadRequestException(result.message);
  }

  async createPaymentIntent(dto: PaymentIntentDto, userId: string) {
    const hotel = await this.hotels.findById(dto.hotelId);
    if (!hotel) {
      throw new BadRequestException("Hotel not found");
    }

    if (hotel.status !== "active") {
      throw new ConflictException("This hotel is not available for booking");
    }

    const nights = Number(dto.numberOfNights);
    if (nights > this.maxNights) {
      throw new ValidationFailedException([
        { field: "numberOfNights", message: `a stay cannot exceed ${this.maxNights} nights` },
      ]);
    }

    const totalCost = (hotel.pricePerNightMinor / 100) * nights;

    const paymentIntent = await this.stripeService.client.paymentIntents.create({
      amount: Math.round(totalCost * 100),
      currency: "gbp",
      metadata: {
        hotelId: hotel.id,
        userId,
      },
    });

    if (!paymentIntent.client_secret) {
      throw new InternalServerErrorException("Error creating payment intent");
    }

    return {
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret.toString(),
      totalCost,
    };
  }

  async create(dto: CreateBookingDto, userId: string): Promise<BookingResponse> {
    const hotel = await this.hotels.findById(dto.hotelId);
    if (!hotel) {
      throw new NotFoundException("Hotel not found");
    }
    if (hotel.status !== "active") {
      throw new ConflictException("This hotel is not available for booking");
    }
    this.validateStay(dto, hotel);

    const paymentIntent = await this.stripeService.client.paymentIntents.retrieve(
      dto.paymentIntentId,
    );

    if (!paymentIntent) {
      throw new BadRequestException("payment intent not found");
    }

    if (
      paymentIntent.metadata.hotelId !== dto.hotelId ||
      paymentIntent.metadata.userId !== userId
    ) {
      throw new BadRequestException("payment intent mismatch");
    }

    if (paymentIntent.status !== "succeeded") {
      throw new BadRequestException(
        `payment intent not succeeded. Status: ${paymentIntent.status}`,
      );
    }

    const checkIn = new Date(dto.checkIn);
    const checkOut = new Date(dto.checkOut);

    const created = await this.bookings.create({
      ownerUserId: userId,
      createdByUserId: userId,
      hotelId: hotel.id,
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phone: dto.phone,
      adultCount: dto.adultCount,
      childCount: dto.childCount,
      checkIn,
      checkOut,
      totalCost: dto.totalCost,
      currencyCode: "GBP",
      specialRequests: dto.specialRequests,
      priceSnapshot: {
        totalCost: dto.totalCost,
        currency: "GBP",
        paymentIntentId: paymentIntent.id,
        numberOfNights: Math.ceil((checkOut.getTime() - checkIn.getTime()) / DAY_MS),
      },
      payment: {
        provider: "stripe",
        providerPaymentId: paymentIntent.id,
        amountMinor: Math.round(dto.totalCost * 100),
        currencyCode: "GBP",
        status: "paid",
      },
    });

    return toBookingResponse(created);
  }

  async findAllAdmin(): Promise<BookingResponse[]> {
    const rows = await this.bookings.listAll();
    return rows.map(toBookingResponse);
  }

  async findOneAdmin(id: string): Promise<BookingResponse> {
    const booking = await this.bookings.findById(id);
    if (!booking) {
      throw new NotFoundException("Booking not found");
    }
    return toBookingResponse(booking);
  }

  async findForHotel(hotelId: string, userId: string): Promise<BookingResponse[]> {
    await this.assertOwnerOrAdmin(hotelId, userId);
    const rows = await this.bookings.listByHotel(hotelId);
    return rows.map(toBookingResponse);
  }

  async findOne(id: string, userId: string): Promise<BookingResponse> {
    const booking = await this.bookings.findById(id);
    if (!booking) {
      throw new NotFoundException("Booking not found");
    }

    this.assertAuthorized(await this.assertCanAccess(booking.booking, userId));
    return toBookingResponse(booking);
  }

  async myBookings(userId: string) {
    const rows = await this.bookings.listByOwner(userId);
    if (rows.length === 0) return [];

    const hotelRecords = await this.hotels.findByIds(rows.map((row) => row.booking.hotelId));
    const hotelsById = new Map(hotelRecords.map((hotel) => [hotel.id, hotel]));

    const grouped = new Map<string, BookingResponse[]>();
    for (const row of rows) {
      const hotel = hotelsById.get(row.booking.hotelId);
      if (!hotel) continue;
      const list = grouped.get(hotel.id) ?? [];
      list.push(toBookingResponse(row));
      grouped.set(hotel.id, list);
    }

    return hotelRecords
      .filter((hotel) => grouped.has(hotel.id))
      .map((hotel) => ({
        ...toPublicHotelResponse(hotel),
        bookings: grouped.get(hotel.id) ?? [],
      }));
  }

  async cancel(id: string, dto: CancelBookingDto, userId: string) {
    const record = await this.bookings.findById(id);
    if (!record) {
      throw new NotFoundException("Booking not found");
    }

    this.assertAuthorized(await this.assertCanAccess(record.booking, userId));

    if (!isCancellable(record.booking)) {
      throw new BadRequestException(
        "Booking cannot be cancelled (must be upcoming pending/confirmed)",
      );
    }

    const cancellationReason =
      typeof dto?.cancellationReason === "string" ? dto.cancellationReason.trim() : "";

    const charge = record.payments.find((payment) => !payment.originalPaymentId);
    const wasPaid = charge?.status === "paid";
    const stripePaymentIntentId =
      charge?.provider === "stripe" ? charge.providerPaymentId : undefined;

    let refundAmount = 0;
    let refundSkipped: string | undefined;
    let refund: { providerPaymentId: string; amountMinor: number } | undefined;

    if (wasPaid && stripePaymentIntentId) {
      try {
        const stripeRefund = await this.stripeService.client.refunds.create({
          payment_intent: stripePaymentIntentId,
        });
        refundAmount =
          typeof stripeRefund.amount === "number"
            ? stripeRefund.amount / 100
            : record.booking.totalAmountMinor / 100;
        if (refundAmount > 0) {
          refund = {
            providerPaymentId: stripeRefund.id,
            amountMinor: Math.round(refundAmount * 100),
          };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Stripe refund failed";
        this.logger.error(
          `Stripe refund failed for booking ${id}`,
          error instanceof Error ? error.stack : undefined,
        );
        throw new BadGatewayException(message);
      }
    } else if (wasPaid && !stripePaymentIntentId) {
      refundSkipped = "Cancelled without Stripe refund (no payment intent on file)";
    }

    const cancelled = await this.bookings.cancel({
      id,
      actorUserId: userId,
      cancellationReason,
      ...(refund && charge
        ? {
            refund: {
              provider: "stripe",
              providerPaymentId: refund.providerPaymentId,
              amountMinor: refund.amountMinor,
              currencyCode: record.booking.currencyCode,
              originalPaymentId: charge.id,
            },
          }
        : {}),
    });

    if (!cancelled) {
      throw new BadRequestException(
        "Booking cannot be cancelled (must be upcoming pending/confirmed)",
      );
    }

    return { booking: toBookingResponse(cancelled), refundAmount, refundSkipped };
  }
}
