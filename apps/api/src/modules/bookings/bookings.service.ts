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
import { UniqueViolationError } from "../../common/errors/postgres-errors";
import { ValidationFailedException } from "../../common/errors/validation-failed.exception";
import { isUuid } from "../../common/utils/uuid";
import {
  BookingsRepository,
  type BookingWithPayments,
} from "../../database/repositories/bookings.repository";
import { HotelsRepository, type HotelRecord } from "../../database/repositories/hotels.repository";
import { UsersRepository } from "../../database/repositories/users.repository";
import { StripeService } from "../../integrations/stripe/stripe.service";
import { PaymentsService } from "../payments/payments.service";
import { toPublicHotelResponse } from "../hotels/hotel-response";
import { BookingQuoteService } from "./booking-quote.service";
import {
  toBookingResponse,
  type BookingCreationResponse,
  type BookingResponse,
} from "./booking-response";
import { CancelBookingDto } from "./dto/cancel-booking.dto";
import { CreateBookingDto } from "./dto/create-booking.dto";
import { PaymentIntentDto } from "./dto/payment-intent.dto";

const DAY_MS = 24 * 60 * 60 * 1000;

const CANCELLABLE_STATUSES = new Set(["pending_payment", "authorized", "confirming", "confirmed"]);

const isCancellable = (booking: { status: string; checkIn: Date }) => {
  if (!CANCELLABLE_STATUSES.has(booking.status)) return false;
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
    private readonly payments: PaymentsService,
    private readonly quote: BookingQuoteService,
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

  /**
   * Creates a booking from a server-computed quote. The client supplies only the stay; money comes
   * from `BookingQuoteService` and the PaymentIntent amount is derived from the frozen snapshot by
   * `PaymentsService`.
   *
   * Two independent replay guards: the HTTP idempotency interceptor returns the stored response
   * for a repeated key, and the booking row's partial unique index catches the case where the
   * stored response has expired or been cleared.
   */
  async create(
    dto: CreateBookingDto,
    userId: string,
    requestId?: string,
    idempotencyKey?: string,
  ): Promise<BookingCreationResponse> {
    if (!idempotencyKey) {
      throw new BadRequestException("Idempotency-Key header is required for this request");
    }

    const hotel = await this.hotels.findById(dto.hotelId);
    if (!hotel) {
      throw new NotFoundException("Hotel not found");
    }
    if (hotel.status !== "active") {
      throw new ConflictException("This hotel is not available for booking");
    }
    this.validateStay(dto, hotel);

    const existing = await this.bookings.findByOwnerAndIdempotencyKey(userId, idempotencyKey);
    if (existing) return this.finishCreation(existing);

    const snapshot = this.quote.quote({
      hotel,
      checkIn: new Date(dto.checkIn),
      checkOut: new Date(dto.checkOut),
    });

    let created: BookingWithPayments;
    try {
      const booking = await this.bookings.createPending({
        ownerUserId: userId,
        createdByUserId: userId,
        hotelId: hotel.id,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        ...(dto.phone ? { phone: dto.phone } : {}),
        adultCount: dto.adultCount,
        childCount: dto.childCount,
        checkIn: new Date(dto.checkIn),
        checkOut: new Date(dto.checkOut),
        totalAmountMinor: snapshot.totalMinor,
        currencyCode: snapshot.currency,
        // The snapshot is JSON-safe and immutable for the life of the booking.
        priceSnapshot: snapshot as unknown as Record<string, unknown>,
        idempotencyKey,
        ...(dto.specialRequests ? { specialRequests: dto.specialRequests } : {}),
        ...(requestId ? { requestId } : {}),
      });
      created = { booking, payments: [] };
    } catch (error) {
      if (
        error instanceof UniqueViolationError &&
        error.constraint === "bookings_owner_idempotency_unique"
      ) {
        const replay = await this.bookings.findByOwnerAndIdempotencyKey(userId, idempotencyKey);
        if (replay) return this.finishCreation(replay);
      }
      throw error;
    }

    return this.finishCreation(created);
  }

  /** Creates the PaymentIntent outside the booking transaction, then returns the fresh aggregate. */
  private async finishCreation(record: BookingWithPayments): Promise<BookingCreationResponse> {
    const intent = await this.payments.createIntentForBooking(record.booking.id);
    const fresh = (await this.bookings.findById(record.booking.id)) ?? record;
    return {
      ...toBookingResponse(fresh),
      clientSecret: intent.clientSecret,
    };
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

  async findOne(reference: string, userId: string): Promise<BookingResponse> {
    const booking = isUuid(reference)
      ? await this.bookings.findById(reference)
      : await this.bookings.findByPublicReference(reference);
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

  async cancel(id: string, dto: CancelBookingDto, userId: string, requestId?: string) {
    const record = await this.bookings.findById(id);
    if (!record) {
      throw new NotFoundException("Booking not found");
    }

    this.assertAuthorized(await this.assertCanAccess(record.booking, userId));

    if (!isCancellable(record.booking)) {
      throw new BadRequestException(
        "Booking cannot be cancelled (must be upcoming and not already terminal)",
      );
    }

    const cancellationReason =
      typeof dto?.cancellationReason === "string" ? dto.cancellationReason.trim() : "";

    const charge = record.payments.find((payment) => !payment.originalPaymentId);
    const wasPaid = charge?.status === "paid";
    const hasStripeCharge = charge?.provider === "stripe" && Boolean(charge.providerPaymentId);
    const shouldRefund = Boolean(wasPaid && hasStripeCharge);

    // Save the cancellation before calling the provider. If the refund then fails, the booking is
    // already terminal and is moved to needs_review instead of being left in an ambiguous state.
    const cancelled = await this.bookings.cancel({
      id,
      actorUserId: userId,
      cancellationReason,
      requestId,
    });

    if (!cancelled) {
      throw new BadRequestException(
        "Booking cannot be cancelled (must be upcoming and not already terminal)",
      );
    }

    let refundAmount = 0;
    let refundSkipped: string | undefined;

    if (shouldRefund) {
      try {
        const refund = await this.payments.refundBooking(id);
        refundAmount = refund.amountMinor / 100;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Stripe refund failed";
        this.logger.error(
          `Refund failed for cancelled booking ${id}`,
          error instanceof Error ? error.stack : undefined,
        );
        try {
          await this.bookings.transition({
            bookingId: id,
            from: "cancelled",
            to: "needs_review",
            actor: { type: "system", name: "payment-refund" },
            reason: "Cancellation refund failed",
            requestId,
          });
        } catch (transitionError) {
          this.logger.error(
            `Could not move booking ${id} to needs_review after refund failure`,
            transitionError instanceof Error ? transitionError.stack : undefined,
          );
        }
        throw new BadGatewayException(message);
      }
    } else if (wasPaid && !hasStripeCharge) {
      refundSkipped = "Cancelled without Stripe refund (no payment intent on file)";
    }

    const refreshed = await this.bookings.findById(id);
    return {
      booking: toBookingResponse(refreshed ?? cancelled),
      refundAmount,
      refundSkipped,
    };
  }
}
