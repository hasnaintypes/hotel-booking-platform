import type { BookingStatus, BookingType } from "@hotel-booking/types";

const DRAFT_KEY = "hotel-booking:checkout-draft";

/** Guest-entered fields kept across a refresh before the booking is created. */
export type CheckoutDraft = {
  phone: string;
  specialRequests: string;
};

const safeSessionStorage = (): Storage | undefined => {
  try {
    return typeof sessionStorage === "undefined" ? undefined : sessionStorage;
  } catch {
    return undefined;
  }
};

export const loadCheckoutDraft = (): CheckoutDraft => {
  const raw = safeSessionStorage()?.getItem(DRAFT_KEY);
  if (!raw) return { phone: "", specialRequests: "" };
  try {
    const parsed = JSON.parse(raw) as Partial<CheckoutDraft>;
    return {
      phone: typeof parsed.phone === "string" ? parsed.phone : "",
      specialRequests: typeof parsed.specialRequests === "string" ? parsed.specialRequests : "",
    };
  } catch {
    return { phone: "", specialRequests: "" };
  }
};

export const saveCheckoutDraft = (draft: CheckoutDraft): void => {
  safeSessionStorage()?.setItem(DRAFT_KEY, JSON.stringify(draft));
};

export const clearCheckoutDraft = (): void => {
  safeSessionStorage()?.removeItem(DRAFT_KEY);
};

/**
 * The states a polled booking can stop at. `needs_review` is terminal for the guest: the booking
 * needs an operator, and inviting another payment could charge them twice.
 */
export const TERMINAL_BOOKING_STATUSES: readonly BookingStatus[] = [
  "confirmed",
  "failed",
  "expired",
  "cancelled",
  "needs_review",
];

export const isTerminalBookingStatus = (status?: BookingStatus): boolean =>
  status !== undefined && TERMINAL_BOOKING_STATUSES.includes(status);

/** The booking's reference is what `GET /bookings/:reference` accepts and is safe to show. */
export const bookingReferenceOf = (booking: Pick<BookingType, "_id" | "publicReference">): string =>
  booking.publicReference || booking._id;
