import { IsString, Matches } from "class-validator";

export class PaymentIntentDto {
  /** A whole number of nights, sent as text. The allowed maximum is enforced by the service. */
  @IsString()
  @Matches(/^[1-9]\d{0,2}$/, { message: "numberOfNights must be a whole number of nights" })
  numberOfNights: string;
}
