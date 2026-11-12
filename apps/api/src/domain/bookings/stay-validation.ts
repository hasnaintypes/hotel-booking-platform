import type { FieldError } from "../../common/errors/problem";

const DAY_MS = 24 * 60 * 60 * 1000;

export type StayRequest = {
  readonly checkIn: string;
  readonly checkOut: string;
  readonly adultCount: number;
  readonly childCount: number;
};

export type StayLimits = {
  readonly adultCount: number;
  readonly childCount: number;
  readonly maxNights: number;
};

/**
 * Rules that depend on the hotel or on today's date. Field formats are checked by the DTO.
 * Check-in may be one day before today (UTC) so a guest in a time zone ahead of UTC can still
 * book "today". The same function runs for direct bookings and for offer quotes, so a quote can
 * never be created for a stay that booking would later reject.
 */
export function validateStay(
  request: StayRequest,
  limits: StayLimits,
  now: Date = new Date(),
): FieldError[] {
  const errors: FieldError[] = [];
  const checkIn = new Date(request.checkIn).getTime();
  const checkOut = new Date(request.checkOut).getTime();

  const startOfTodayUtc = new Date(now.getTime()).setUTCHours(0, 0, 0, 0);
  if (checkIn < startOfTodayUtc - DAY_MS) {
    errors.push({ field: "checkIn", message: "check-in cannot be in the past" });
  }

  if (checkOut <= checkIn) {
    errors.push({ field: "checkOut", message: "check-out must be after check-in" });
  } else if (Math.ceil((checkOut - checkIn) / DAY_MS) > limits.maxNights) {
    errors.push({
      field: "checkOut",
      message: `a stay cannot exceed ${limits.maxNights} nights`,
    });
  }

  if (request.adultCount > limits.adultCount) {
    errors.push({
      field: "adultCount",
      message: `this hotel allows at most ${limits.adultCount} adults`,
    });
  }
  if (request.childCount > limits.childCount) {
    errors.push({
      field: "childCount",
      message: `this hotel allows at most ${limits.childCount} children`,
    });
  }

  return errors;
}
