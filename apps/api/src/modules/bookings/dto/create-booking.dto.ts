import { Transform, type TransformFnParams } from "class-transformer";
import {
  IsEmail,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

const trim = ({ value }: TransformFnParams) => (typeof value === "string" ? value.trim() : value);

/**
 * A booking request describes the stay only: the server prices it from the hotel's own rate and
 * creates the PaymentIntent from that quote. Money fields are deliberately absent, so the global
 * validation pipe's whitelist strips `totalCost` or `paymentIntentId` if a client still sends them.
 *
 * Field formats are checked here. Rules that depend on the hotel or on today's date (check-out
 * after check-in, not in the past, maximum stay, guest capacity) are enforced in BookingsService.
 */
export class CreateBookingDto {
  @IsUUID()
  hotelId: string;

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

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  specialRequests?: string;
}
