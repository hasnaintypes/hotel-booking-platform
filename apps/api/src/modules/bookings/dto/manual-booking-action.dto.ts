import { Transform, type TransformFnParams } from "class-transformer";
import { IsString, MaxLength, MinLength } from "class-validator";

const MIN_REASON_LENGTH = 3;
const MAX_REASON_LENGTH = 500;

const trimmed = (params: TransformFnParams) =>
  typeof params.value === "string" ? params.value.trim() : params.value;

/**
 * Manual booking actions always demand a human-written reason: it lands in `booking_events` next
 * to the actor, permission and request id.
 */
export class ManualBookingActionDto {
  @Transform(trimmed)
  @IsString()
  @MinLength(MIN_REASON_LENGTH)
  @MaxLength(MAX_REASON_LENGTH)
  reason!: string;
}
