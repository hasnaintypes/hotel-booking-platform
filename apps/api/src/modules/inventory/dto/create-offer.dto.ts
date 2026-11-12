import { IsInt, IsISO8601, IsUUID, Max, Min } from "class-validator";

/**
 * A quote request. The stay is described only; prices and policies always come from a provider,
 * never from the client.
 */
export class CreateOfferDto {
  @IsUUID()
  hotelId: string;

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
}
