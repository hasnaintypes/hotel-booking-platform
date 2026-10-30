import { IsInt, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class CreateBookingDto {
  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsString()
  email: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsInt()
  @Min(0)
  adultCount: number;

  @IsInt()
  @Min(0)
  childCount: number;

  @IsString()
  checkIn: string;

  @IsString()
  checkOut: string;

  @IsNumber()
  totalCost: number;

  @IsString()
  paymentIntentId: string;

  @IsOptional()
  @IsString()
  specialRequests?: string;
}
