import { Transform, type TransformFnParams } from "class-transformer";
import { IsString, MaxLength, MinLength } from "class-validator";

const MIN_REASON_LENGTH = 3;
const MAX_REASON_LENGTH = 500;

const trimmed = (params: TransformFnParams) =>
  typeof params.value === "string" ? params.value.trim() : params.value;

/**
 * Admin cancellation. Unlike the guest route, the operator must write why they cancelled: the
 * reason lands on the `cancelling` event beside the actor, permission and request id.
 */
export class AdminCancelBookingDto {
  @Transform(trimmed)
  @IsString()
  @MinLength(MIN_REASON_LENGTH)
  @MaxLength(MAX_REASON_LENGTH)
  reason!: string;
}
