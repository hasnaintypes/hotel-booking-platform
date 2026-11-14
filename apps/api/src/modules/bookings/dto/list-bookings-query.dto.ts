import { Transform, type TransformFnParams } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";
import { BOOKING_LIST_LIMIT } from "../../../database/repositories/bookings.repository";
import { BOOKING_STATUSES } from "../../../domain/bookings/booking-state-machine";

const MAX_SEARCH_LENGTH = 120;
const MAX_OFFSET = 10_000;

// Empty query values mean "not provided"; numbers arrive as strings and convert explicitly.
const raw = ({ obj, key }: TransformFnParams): unknown => obj[key];

const blankToUndefined = (params: TransformFnParams) => {
  const value = raw(params);
  return value === "" || value === null ? undefined : value;
};

const toOptionalNumber = (params: TransformFnParams) => {
  const value = blankToUndefined(params);
  return typeof value === "string" ? Number(value) : value;
};

/** Filters for the admin booking and `needs_review` queues. */
export class ListBookingsQueryDto {
  @IsOptional()
  @Transform(blankToUndefined)
  @IsIn(BOOKING_STATUSES)
  status?: (typeof BOOKING_STATUSES)[number];

  @IsOptional()
  @Transform(blankToUndefined)
  @IsUUID()
  hotelId?: string;

  @IsOptional()
  @Transform(blankToUndefined)
  @IsString()
  @MaxLength(MAX_SEARCH_LENGTH)
  q?: string;

  @IsOptional()
  @Transform(toOptionalNumber)
  @IsInt()
  @Min(1)
  @Max(BOOKING_LIST_LIMIT)
  limit?: number;

  @IsOptional()
  @Transform(toOptionalNumber)
  @IsInt()
  @Min(0)
  @Max(MAX_OFFSET)
  offset?: number;
}
