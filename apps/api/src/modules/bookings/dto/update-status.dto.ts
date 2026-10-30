import { IsIn, IsOptional, IsString } from "class-validator";

export const BOOKING_STATUSES = [
  "pending",
  "confirmed",
  "cancelled",
  "completed",
  "refunded",
] as const;

export class UpdateStatusDto {
  @IsIn(BOOKING_STATUSES, { message: "Invalid status" })
  status: (typeof BOOKING_STATUSES)[number];

  @IsOptional()
  @IsString()
  cancellationReason?: string;
}
