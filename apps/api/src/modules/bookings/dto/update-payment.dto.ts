import { IsIn, IsOptional, IsString } from "class-validator";

export const PAYMENT_STATUSES = ["pending", "paid", "failed", "refunded"] as const;

export class UpdatePaymentDto {
  @IsIn(PAYMENT_STATUSES, { message: "Invalid payment status" })
  paymentStatus: (typeof PAYMENT_STATUSES)[number];

  @IsOptional()
  @IsString()
  paymentMethod?: string;
}
