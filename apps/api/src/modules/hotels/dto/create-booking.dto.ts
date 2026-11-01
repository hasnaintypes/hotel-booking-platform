import { Transform, type TransformFnParams } from "class-transformer";
import {
  IsEmail,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

const trim = ({ value }: TransformFnParams) => (typeof value === "string" ? value.trim() : value);

/**
 * Field-level checks only. Rules that depend on the hotel or on today's date (check-out after
 * check-in, not in the past, maximum stay, guest capacity) are enforced in HotelsService.
 */
export class CreateBookingDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;

  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsOptional()
  @Transform(trim)
  @Matches(/^[+()\d][\d\s().-]{5,24}$/, { message: "phone must be a valid phone number" })
  phone?: string;

  @IsInt()
  @Min(1)
  @Max(50)
  adultCount: number;

  @IsInt()
  @Min(0)
  @Max(50)
  childCount: number;

  @IsISO8601({ strict: true, strictSeparator: true })
  checkIn: string;

  @IsISO8601({ strict: true, strictSeparator: true })
  checkOut: string;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(1_000_000)
  totalCost: number;

  @IsString()
  @Matches(/^pi_[A-Za-z0-9_]+$/, { message: "paymentIntentId must be a Stripe payment intent id" })
  @MaxLength(255)
  paymentIntentId: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  specialRequests?: string;
}
