import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DEFAULT_MANAGED_CANCELLATION_POLICY,
  quoteCancellation,
  readCancellationPolicy,
  type CancellationQuote,
  type PriceSnapshotNight,
} from "@hotel-booking/pricing";
import { CLOCK, type Clock } from "../../common/clock";
import { UniqueViolationError } from "../../common/errors/postgres-errors";
import { ValidationFailedException } from "../../common/errors/validation-failed.exception";
import { isUuid } from "../../common/utils/uuid";
import {
  BookingsRepository,
  type BookingWithPayments,
} from "../../database/repositories/bookings.repository";
import { HotelsRepository, type HotelRecord } from "../../database/repositories/hotels.repository";
import { UsersRepository } from "../../database/repositories/users.repository";
import {
  BookingTransitionConflictError,
  type BookingStatus,
} from "../../domain/bookings/booking-state-machine";
import { validateStay } from "../../domain/bookings/stay-validation";
import { StripeService } from "../../integrations/stripe/stripe.service";
import { PaymentsService } from "../payments/payments.service";
import { toPublicHotelResponse } from "../hotels/hotel-response";
import { OffersService } from "../inventory/offers.service";
import {
  toBookingResponse,
  type BookingCreationResponse,
  type BookingResponse,
} from "./booking-response";
import { CancelBookingDto } from "./dto/cancel-booking.dto";
import { CreateBookingDto } from "./dto/create-booking.dto";
import { PaymentIntentDto } from "./dto/payment-intent.dto";

const CANCELLABLE_STATUSES = new Set([
  "pending_payment",
  "authorized",
  "confirming",
  "confirmed",
  // A failed refund parks the booking here; cancelling again retries the refund.
  "needs_review",
]);

type BookingRow = BookingWithPayments["booking"];

type CancellationPlan = { amountMinor: number; skipped?: string };

type CancellationResult = { refundMinor: number; skipped?: string };

type CancellationOutcome = { result: CancellationResult } | { refundError: string };

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
    private readonly offers: OffersService,
    private readonly config: ConfigService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private get maxNights(): number {
    return this.config.get<number>("booking.maxNights") ?? 30;
  }

  /** How long a guest has to pay before the expiry job releases the hold. */
  private get paymentHoldMinutes(): number {
    return this.config.get<number>("jobs.paymentHoldMinutes") ?? 30;
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
    const errors = validateStay(
      dto,
      { adultCount: hotel.adultCount, childCount: hotel.childCount, maxNights: this.maxNights },
      this.clock.now(),
    );
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
   * Creates a booking from a frozen offer. The client supplies the stay (and optionally an
   * `offerId`); money and cancellation terms always come from the offer selected through
   * `OffersService`, never from the client. Without an `offerId` the managed provider produces a
   * fresh offer first, so every booking follows the same path.
   *
   * Replay guards: the HTTP idempotency interceptor returns the stored response for a repeated
   * key, the booking row's partial unique index catches a cleared response, and the unique
   * `offer_id` index catches the same offer being booked twice.
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

    const offer = dto.offerId
      ? await this.offers.findBookable(dto.offerId, userId, {
          hotelId: dto.hotelId,
          checkIn: dto.checkIn,
          checkOut: dto.checkOut,
          adultCount: dto.adultCount,
          childCount: dto.childCount,
        })
      : await this.offers.createOffer(
          {
            hotelId: dto.hotelId,
            checkIn: dto.checkIn,
            checkOut: dto.checkOut,
            adultCount: dto.adultCount,
            childCount: dto.childCount,
          },
          userId,
        );

    const now = this.clock.now();
    // Pay before either term expires: the offer's own TTL may be shorter than the payment hold.
    const expiresAt = new Date(
      Math.min(offer.expiresAt.getTime(), now.getTime() + this.paymentHoldMinutes * 60_000),
    );

    let created: BookingWithPayments;
    try {
      const booking = await this.bookings.createPending({
        ownerUserId: userId,
        createdByUserId: userId,
        hotelId: hotel.id,
        offerId: offer.id,
        inventorySource: offer.source,
        ...(offer.supplierId ? { supplierId: offer.supplierId } : {}),
        ...(offer.supplierOfferId ? { supplierReference: offer.supplierOfferId } : {}),
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        ...(dto.phone ? { phone: dto.phone } : {}),
        adultCount: offer.adultCount,
        childCount: offer.childCount,
        checkIn: parseStayDate(offer.checkIn),
        checkOut: parseStayDate(offer.checkOut),
        totalAmountMinor: offer.price.totalMinor,
        currencyCode: offer.price.currency,
        // Both snapshots are JSON-safe and immutable for the life of the booking.
        priceSnapshot: offer.price as unknown as Record<string, unknown>,
        cancellationPolicySnapshot: offer.cancellationPolicy as unknown as Record<string, unknown>,
        expiresAt,
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
      if (
        error instanceof UniqueViolationError &&
        error.constraint === "bookings_offer_id_unique"
      ) {
        // A retry with a new idempotency key still gets the original booking, not a second charge.
        const replay = await this.bookings.findByOfferId(offer.id);
        if (replay && replay.booking.ownerUserId === userId) {
          return this.finishCreation(replay);
        }
        throw new ConflictException("This offer has already been booked");
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

  /**
   * Cancels a booking according to its frozen policy.
   *
   * The booking moves through `cancelling` before any provider call: the refund is computed from
   * the snapshot, the amount is refunded through `PaymentsService` (which records the refund
   * payment and ledger rows and calls Stripe with an idempotency key), and only then does the
   * booking become `cancelled`.
   *
   * The writes run in a transaction of their own rather than the idempotency interceptor's request
   * transaction. A failed refund must leave the booking in `needs_review` even though the HTTP
   * request answers with an error and the interceptor rolls its own transaction back.
   */
  async cancel(id: string, dto: CancelBookingDto, userId: string, requestId?: string) {
    const outcome = await this.bookings.inDetachedTransaction(() =>
      this.cancelWithinTransaction(id, dto, userId, requestId),
    );

    if ("refundError" in outcome) {
      throw new BadGatewayException(outcome.refundError);
    }

    // Read after the detached transaction commits: `findById` queries the pooled connection, not
    // the transaction, so doing it inside would return the pre-cancellation row.
    const refreshed = await this.bookings.findById(id);
    if (!refreshed) {
      throw new NotFoundException("Booking not found");
    }

    return {
      booking: toBookingResponse(refreshed),
      refundAmount: outcome.result.refundMinor / 100,
      ...(outcome.result.skipped ? { refundSkipped: outcome.result.skipped } : {}),
    };
  }

  private async cancelWithinTransaction(
    id: string,
    dto: CancelBookingDto,
    userId: string,
    requestId?: string,
  ): Promise<CancellationOutcome> {
    const record = await this.bookings.findById(id);
    if (!record) {
      throw new NotFoundException("Booking not found");
    }

    this.assertAuthorized(await this.assertCanAccess(record.booking, userId));

    // A booking that already reached `cancelling`, or that returned to `needs_review` with a
    // refund attempt on file, resumes instead of starting a second cancellation.
    const hasRefundAttempt = record.payments.some((payment) => payment.originalPaymentId !== null);
    if (
      record.booking.status === "cancelling" ||
      (record.booking.status === "needs_review" && hasRefundAttempt)
    ) {
      return this.resumeCancellation(record, userId, requestId);
    }

    if (!this.mayCancel(record.booking)) {
      throw new BadRequestException(
        "Booking cannot be cancelled (must be upcoming and not already terminal)",
      );
    }

    const cancellationReason =
      typeof dto?.cancellationReason === "string" ? dto.cancellationReason.trim() : "";
    const quote = this.cancellationQuote(record.booking);
    const plan = this.refundPlan(record, quote);

    // Freeze what was quoted on the transition, so a retry days later refunds the same amount.
    await this.transitionBooking(
      id,
      record.booking.status,
      "cancelling",
      userId,
      cancellationReason,
      requestId,
      undefined,
      { refund: { ...plan, currency: quote.currency, penaltyMinor: quote.penaltyMinor } },
    );

    return this.settleCancellation(id, userId, cancellationReason, requestId, plan);
  }

  private mayCancel(booking: BookingRow): boolean {
    return CANCELLABLE_STATUSES.has(booking.status) && booking.checkIn.getTime() > Date.now();
  }

  private cancellationQuote(booking: BookingRow): CancellationQuote {
    return quoteCancellation({
      // Rows written before #53 have no snapshot; the managed default is the documented fallback.
      policy:
        readCancellationPolicy(booking.cancellationPolicySnapshot) ??
        DEFAULT_MANAGED_CANCELLATION_POLICY,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      now: new Date(),
      totalMinor: booking.totalAmountMinor,
      currency: booking.currencyCode,
      nightlyRates: nightlyRatesOf(booking.priceSnapshot),
    });
  }

  private refundPlan(record: BookingWithPayments, quote: CancellationQuote): CancellationPlan {
    const charge = record.payments.find((payment) => !payment.originalPaymentId);
    if (charge?.status !== "paid") return { amountMinor: 0 };
    if (charge.provider !== "stripe" || !charge.providerPaymentId) {
      return {
        amountMinor: 0,
        skipped: "Cancelled without Stripe refund (no payment intent on file)",
      };
    }
    if (quote.refundMinor === 0) {
      return { amountMinor: 0, skipped: "Cancellation policy leaves no refundable amount" };
    }
    return { amountMinor: quote.refundMinor };
  }

  private async settleCancellation(
    id: string,
    userId: string,
    cancellationReason: string,
    requestId: string | undefined,
    plan: CancellationPlan,
  ): Promise<CancellationOutcome> {
    let refundMinor = 0;

    if (plan.amountMinor > 0) {
      try {
        refundMinor = (await this.payments.refundBooking(id, plan.amountMinor)).amountMinor;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Stripe refund failed";
        this.logger.error(
          `Refund failed for cancelling booking ${id}`,
          error instanceof Error ? error.stack : undefined,
        );
        // Commits with the detached transaction before the caller turns this into a 502.
        await this.transitionBooking(
          id,
          "cancelling",
          "needs_review",
          userId,
          "Cancellation refund failed",
          requestId,
          { type: "system", name: "payment-refund" },
        );
        return { refundError: message };
      }
    }

    // Only the provider abstraction is used here; managed inventory is a no-op and a supplier
    // adapter releases the reservation. A failure must not mark the booking cancelled.
    const current = await this.bookings.findById(id);
    const inventoryError = current ? await this.cancelInventory(current.booking) : null;
    if (inventoryError) {
      await this.transitionBooking(
        id,
        "cancelling",
        "needs_review",
        userId,
        "Cancellation provider failed",
        requestId,
        { type: "system", name: "inventory" },
      );
      return { refundError: inventoryError };
    }

    await this.transitionBooking(
      id,
      "cancelling",
      "cancelled",
      userId,
      cancellationReason,
      requestId,
    );

    return { result: { refundMinor, ...(plan.skipped ? { skipped: plan.skipped } : {}) } };
  }

  /** Completes a cancellation that died after the `cancelling` transition. */
  private async resumeCancellation(
    record: BookingWithPayments,
    userId: string,
    requestId?: string,
  ): Promise<CancellationOutcome> {
    const { booking, payments } = record;
    const refunds = payments.filter((payment) => payment.originalPaymentId !== null);
    const refundedMinor = refunds
      .filter((payment) => payment.status === "refunded")
      .reduce((total, payment) => total + payment.amountMinor, 0);
    const cancellationReason = booking.cancellationReason ?? "";

    if (refundedMinor > 0) {
      const inventoryError = await this.cancelInventory(booking);
      if (inventoryError) {
        throw new BadGatewayException(inventoryError);
      }
      await this.transitionBooking(
        booking.id,
        booking.status,
        "cancelled",
        userId,
        cancellationReason,
        requestId,
      );
      return { result: { refundMinor: refundedMinor } };
    }

    // A pending refund means Stripe may already hold the money; only an operator can resolve it.
    if (refunds.some((payment) => payment.status === "pending")) {
      throw new ConflictException(
        "Cancellation is already in progress; retry once the refund settles",
      );
    }

    const plan =
      (await this.bookings.cancellationIntent(booking.id)) ??
      this.refundPlan(record, this.cancellationQuote(booking));

    if (booking.status !== "cancelling") {
      await this.transitionBooking(
        booking.id,
        booking.status,
        "cancelling",
        userId,
        cancellationReason,
        requestId,
        undefined,
        { refund: plan },
      );
    }

    return this.settleCancellation(booking.id, userId, cancellationReason, requestId, plan);
  }

  /** Returns an error message instead of throwing so callers can park the booking first. */
  private async cancelInventory(booking: BookingRow): Promise<string | null> {
    try {
      await this.offers.cancelBooking({
        bookingId: booking.id,
        offerId: booking.offerId,
        source: booking.inventorySource,
        supplierId: booking.supplierId,
        supplierReference: booking.supplierReference,
      });
      return null;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The inventory provider could not cancel";
      this.logger.error(
        `Inventory cancellation failed for booking ${booking.id}`,
        error instanceof Error ? error.stack : undefined,
      );
      return message;
    }
  }

  private async transitionBooking(
    id: string,
    from: BookingStatus,
    to: BookingStatus,
    userId: string,
    reason: string,
    requestId?: string,
    actor: { type: "user"; userId: string } | { type: "system"; name: string } = {
      type: "user",
      userId,
    },
    metadata?: Record<string, unknown>,
  ): Promise<BookingRow> {
    try {
      return await this.bookings.transition({
        bookingId: id,
        from,
        to,
        actor,
        ...(reason ? { reason } : {}),
        ...(requestId ? { requestId } : {}),
        ...(metadata ? { metadata } : {}),
      });
    } catch (error) {
      if (error instanceof BookingTransitionConflictError) {
        throw new ConflictException("Booking changed while it was being cancelled; retry");
      }
      throw error;
    }
  }
}

/** Offer dates are calendar dates; store them at UTC midnight like the booking date columns. */
const parseStayDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

/** Nightly rates from a stored price snapshot, ignoring malformed entries. */
function nightlyRatesOf(snapshot: unknown): PriceSnapshotNight[] {
  if (typeof snapshot !== "object" || snapshot === null) return [];
  const rates = (snapshot as Record<string, unknown>).nightlyRates;
  if (!Array.isArray(rates)) return [];

  return rates.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const { date, amountMinor } = entry as { date?: unknown; amountMinor?: unknown };
    return typeof date === "string" &&
      typeof amountMinor === "number" &&
      Number.isSafeInteger(amountMinor)
      ? [{ date, amountMinor }]
      : [];
  });
}
