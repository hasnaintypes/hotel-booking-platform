import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { BookingsRepository } from "../../database/repositories/bookings.repository";
import { BookingTransitionConflictError } from "../../domain/bookings/booking-state-machine";
import { BookingRecoveryService } from "../reconciliation/booking-recovery.service";
import { toBookingDetailResponse, type BookingDetailResponse } from "./booking-response";
import { ManualBookingActionDto } from "./dto/manual-booking-action.dto";

/**
 * Manual booking operations. Every action starts from a state the state machine already offers,
 * requires a human-written reason, and appends an audit event carrying the actor, the permission
 * that authorised it and the request id. Nothing here writes a status directly.
 */
@Injectable()
export class BookingActionsService {
  constructor(
    private readonly bookings: BookingsRepository,
    private readonly recovery: BookingRecoveryService,
  ) {}

  /**
   * Re-runs the payment flow for a booking parked in `needs_review`. The booking moves back to
   * `confirming` first (an audited transition), then recovery re-reads the provider and either
   * confirms the stay or parks it in `needs_review` again with the provider's reason.
   */
  async retry(
    id: string,
    dto: ManualBookingActionDto,
    userId: string,
    requestId?: string,
  ): Promise<BookingDetailResponse> {
    const record = await this.bookings.findById(id);
    if (!record) {
      throw new NotFoundException("Booking not found");
    }
    if (record.booking.status !== "needs_review") {
      throw new ConflictException("Only a booking in needs_review can be retried");
    }

    try {
      await this.bookings.transition({
        bookingId: id,
        from: "needs_review",
        to: "confirming",
        actor: { type: "user", userId },
        reason: dto.reason,
        ...(requestId ? { requestId } : {}),
        metadata: { action: "retry", permission: "booking.retry", source: "admin-console" },
      });
    } catch (error) {
      if (error instanceof BookingTransitionConflictError) {
        throw new ConflictException("Booking changed while it was being retried; retry");
      }
      throw error;
    }

    await this.recovery.recoverBooking(id);
    return this.detailOf(id);
  }

  /** The freshly assembled detail, sharing the shape `GET /admin/bookings/:id` returns. */
  private async detailOf(id: string): Promise<BookingDetailResponse> {
    const refreshed = await this.bookings.findById(id);
    if (!refreshed) {
      throw new NotFoundException("Booking not found");
    }
    const events = await this.bookings.listEvents(id);
    return toBookingDetailResponse(refreshed, events);
  }
}
